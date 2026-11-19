import { zip, sheet } from "./xlsx-workbook";
import { PORTFOLIO, type PortfolioRow } from "@/mocks/data";

type ExportKind =
  | "oportunidades"
  | "movel"
  | "ftth"
  | "digital"
  | "avancada"
  | "vivo-tech"
  | "contato"
  | "aparelhos"
  | "renovacao-aparelho"
  | "aparelhos-sem-renovacao";

const labels: Record<ExportKind, string> = {
  oportunidades: "CNPJs com oportunidade",
  movel: "Oportunidade Móvel",
  ftth: "Oportunidades de FTTH",
  digital: "CNPJs com Oferta Digital",
  avancada: "Oportunidade de Avançada",
  "vivo-tech": "Oportunidade Vivo Tech",
  contato: "CNPJs com contato",
  aparelhos: "CNPJs com oportunidade aparelhos",
  "renovacao-aparelho": "Renovação Móvel + Aparelho",
  "aparelhos-sem-renovacao": "Aparelho sem renovação",
};

function matches(row: PortfolioRow, kind: ExportKind) {
  switch (kind) {
    case "movel":
      return row.oportMovel;
    case "ftth":
      return row.oportFtth;
    case "digital":
      return row.oportLicencas;
    case "avancada":
      return row.qtdOportunidades >= 3;
    case "vivo-tech":
      return row.servicosDigitais;
    case "contato":
      return Boolean(row.cnpj);
    case "aparelhos":
      return row.parqueMovel > 0;
    case "renovacao-aparelho":
      return row.oportMovel && row.servicosDigitais;
    case "aparelhos-sem-renovacao":
      return row.parqueMovel > 0 && !row.oportMovel;
    case "oportunidades":
      return row.oportMovel || row.oportFtth || row.oportLicencas || row.servicosDigitais;
  }
}

export function exportOpportunityBase(kind: ExportKind, partnerIds: string[]) {
  const scoped = PORTFOLIO.filter((row) =>
    partnerIds.length ? partnerIds.includes(row.partnerId) : true,
  );
  const unique = new Map(scoped.filter((row) => matches(row, kind)).map((row) => [row.cnpj, row]));
  const rows = [
    [
      "CNPJ",
      "Razão social",
      "Parceiro",
      "Município",
      "UF",
      "Parque móvel",
      "REC_MOVEL",
      "Oportunidade",
    ],
    ...[...unique.values()].map((row) => [
      row.cnpj,
      row.razaoSocial,
      row.partnerName,
      row.municipio,
      row.uf,
      String(row.parqueMovel),
      String(row.recMovel),
      labels[kind],
    ]),
  ];
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clientes" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const bytes = zip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/worksheets/sheet1.xml", data: sheet(rows) },
  ]);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${kind}-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return unique.size;
}
