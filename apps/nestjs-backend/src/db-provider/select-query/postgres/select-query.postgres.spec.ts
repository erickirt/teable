import { describe, expect, it } from 'vitest';

import { getDefaultDatetimeParsePattern } from '../../utils/default-datetime-parse-pattern';
import { SelectQueryPostgres } from './select-query.postgres';

describe('SelectQueryPostgres tzWrap', () => {
  it('sanitizes text-like datetime inputs even when SQL contains timestamp tokens', () => {
    const query = new SelectQueryPostgres();
    query.setContext({ timeZone: 'Asia/Shanghai' } as unknown as never);
    query.setCallMetadata([{ type: 'string', isFieldReference: false }] as unknown as never);

    const expr =
      "CONCAT(TO_CHAR(TIMEZONE('Etc/GMT-8', (col)::timestamptz), 'YYYY-MM-DD'), ' ', col2)";
    const sql = query.datetimeFormat(expr, "'HH:mm:ss'");

    expect(sql).toContain('BTRIM');
    expect(sql).toContain('CASE WHEN');
    expect(sql).toContain(getDefaultDatetimeParsePattern());
  });

  it('does not sanitize trusted datetime inputs', () => {
    const query = new SelectQueryPostgres();
    query.setContext({ timeZone: 'Asia/Shanghai' } as unknown as never);
    query.setCallMetadata([{ type: 'datetime', isFieldReference: false }] as unknown as never);

    const sql = query.datetimeFormat('col', "'HH:mm:ss'");
    expect(sql).not.toContain('BTRIM');
  });
});
