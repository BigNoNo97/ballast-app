// פענוח CSV לפי RFC 4180: שדות במירכאות (כולל פסיקים, מירכאות כפולות ושורות חדשות בתוכם),
// BOM בתחילת הקובץ ו-CRLF. מחזיר רשומות לפי שורת הכותרת.
// המפריד מזוהה לפי שורת הכותרת: חלק מהאפליקציות (Strong באזורים מסוימים) מייצאות עם ';'.
function sniffDelimiter(text: string): string {
  const end = text.search(/[\r\n]/);
  const header = end === -1 ? text : text.slice(0, end);
  return (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ',';
}

export function parseCsv(text: string, delimiter = sniffDelimiter(text)): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, idx) => {
      rec[k] = (r[idx] ?? '').trim();
    });
    return rec;
  });
}
