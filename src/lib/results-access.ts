import type {
  BestGuessSnapshot,
  MapaSnapshot,
  Partner,
  PortabilidadeSnapshot,
  ResultadosYoySnapshot,
  TorresServicoSnapshot,
} from "./snapshot-types";

import type { AuthRole } from "./auth.server";

type ResultsSnapshots = {
  mapa: Pick<MapaSnapshot, "partners">;
  resultados: ResultadosYoySnapshot;
  bestGuess: BestGuessSnapshot;
  portabilidade: PortabilidadeSnapshot;
  torres: TorresServicoSnapshot;
};

// These Excel serial-date headers are source artifacts, not business metrics.
// Keep them out of every authorized payload, including snapshots imported before
// the processor started filtering them.
const isExcelDateHeader = (label: string) => /^\d{5}$/.test(label.trim());

export function normalizeCompany(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function createPartnerNameResolver(partners: Partner[]) {
  const canonicalNames = partners.map((partner) => ({
    name: partner.name,
    key: normalizeCompany(partner.name),
  }));

  return (sourceName: string) => {
    const sourceKey = normalizeCompany(sourceName);
    const exactMatch = canonicalNames.find((partner) => partner.key === sourceKey);
    if (exactMatch) return exactMatch.name;

    // The commercial workbook commonly abbreviates company names by omitting
    // suffixes such as "Telecom" or "Business". Only accept a prefix match
    // when it identifies a single partner, avoiding unsafe fuzzy associations.
    const prefixMatches = canonicalNames.filter(
      (partner) => partner.key.startsWith(sourceKey) || sourceKey.startsWith(partner.key),
    );
    return prefixMatches.length === 1 ? prefixMatches[0].name : sourceName;
  };
}

function reconcileTowerPartnerNames(
  snapshot: TorresServicoSnapshot,
  partners: Partner[],
): TorresServicoSnapshot {
  const resolvePartnerName = createPartnerNameResolver(partners);
  return {
    ...snapshot,
    towers: snapshot.towers.map((tower) => {
      const columns = tower.columns.filter((column) => !isExcelDateHeader(column.label));
      const visibleValues = (values: Record<string, string | number | null>) =>
        Object.fromEntries(columns.map((column) => [column.key, values[column.key]]));

      return {
        ...tower,
        columns,
        rows: tower.rows.map((row) => ({
          ...row,
          partner: resolvePartnerName(row.partner),
          values: visibleValues(row.values),
        })),
        total: visibleValues(tower.total),
      };
    }),
  };
}

export function buildAuthorizedResultsPayload(role: AuthRole, snapshots: ResultsSnapshots) {
  if (role === "admin") {
    throw new Error("Administradores não podem acessar dados de resultados.");
  }

  const bestGuessRecords = snapshots.bestGuess.records;
  const bestGuessTotal = bestGuessRecords.reduce(
    (total, record) => ({
      m0MtdPortIn: total.m0MtdPortIn + record.m0MtdPortIn,
      m0MtdPortOut: total.m0MtdPortOut + record.m0MtdPortOut,
      m0MtdSaldo: total.m0MtdSaldo + record.m0MtdSaldo,
      bgFmPortIn: total.bgFmPortIn + record.bgFmPortIn,
      bgFmPortOut: total.bgFmPortOut + record.bgFmPortOut,
      bgFmSaldo: total.bgFmSaldo + record.bgFmSaldo,
    }),
    {
      m0MtdPortIn: 0,
      m0MtdPortOut: 0,
      m0MtdSaldo: 0,
      bgFmPortIn: 0,
      bgFmPortOut: 0,
      bgFmSaldo: 0,
    },
  );

  return {
    resultados: {
      source: snapshots.resultados.source,
      records: snapshots.resultados.records,
    },
    bestGuess: {
      source: snapshots.bestGuess.source,
      records: bestGuessRecords,
      total: bestGuessTotal,
    },
    portabilidade: {
      source: snapshots.portabilidade.source,
      records: snapshots.portabilidade.records,
    },
    torres: reconcileTowerPartnerNames(snapshots.torres, snapshots.mapa.partners),
  };
}
