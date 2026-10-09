// Excel (xlsx/xls) → linhas de células, usando o SheetJS (carregado só quando precisa).
// Datas ficam como número de série do Excel (o mapeamento converte); assim não há erro de fuso.

export type Celula = string | number;

export async function lerPlanilha(buf: ArrayBuffer): Promise<{ abas: string[]; ler: (aba: string) => Celula[][] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  return {
    abas: wb.SheetNames,
    ler: (aba: string) => {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, raw: true, defval: '', blankrows: false });
      return rows.map(r => r.map(c => (typeof c === 'number' ? c : String(c ?? '').trim())));
    },
  };
}
