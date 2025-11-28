/* eslint-disable sonarjs/no-duplicate-string */
import { DbFieldType } from '@teable/core';
import type { IFormulaParamMetadata, TableDomain } from '@teable/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IFormulaConversionContext } from '../../../features/record/query-builder/sql-conversion.visitor';
import { GeneratedColumnQueryPostgres } from './generated-column-query.postgres';

const castTs = (expr: string) => `(${expr})::timestamp`;

describe('GeneratedColumnQueryPostgres unit-aware helpers', () => {
  const query = new GeneratedColumnQueryPostgres();
  const stubContext: IFormulaConversionContext = {
    table: null as unknown as TableDomain,
    isGeneratedColumn: true,
  };

  beforeEach(() => {
    query.setContext(stubContext);
  });

  afterEach(() => {
    query.setCallMetadata(undefined);
  });

  it('left casts expressions to text for generated columns', () => {
    expect(query.left('raw_expr', '5')).toBe(`LEFT((raw_expr)::text, 5::integer)`);
  });

  it('right casts expressions to text for generated columns', () => {
    expect(query.right('raw_expr', '4')).toBe(`RIGHT((raw_expr)::text, 4::integer)`);
  });

  it('mid casts expressions to text for generated columns', () => {
    expect(query.mid('raw_expr', '2', '5')).toBe(
      `SUBSTRING((raw_expr)::text FROM 2::integer FOR 5::integer)`
    );
  });

  it('find casts numeric search values to text expressions', () => {
    expect(query.find('202', '"text_col"')).toBe(`POSITION((202)::text IN ("text_col")::text)`);
  });

  it('find with start argument casts inputs to text expressions', () => {
    expect(query.find('202', '"text_col"', '3')).toBe(
      `POSITION((202)::text IN SUBSTRING(("text_col")::text FROM 3::integer)) + 3::integer - 1`
    );
  });

  it('search casts numeric search values before applying upper', () => {
    expect(query.search('202', '"text_col"')).toBe(
      `POSITION(UPPER((202)::text) IN UPPER(("text_col")::text))`
    );
  });

  it('coerces non-text inputs to text for string functions', () => {
    const numericMetadata: IFormulaParamMetadata[] = [
      {
        type: 'number',
        isFieldReference: true,
        field: {
          id: 'fldNum',
          dbFieldName: 'AutoNumber',
          dbFieldType: DbFieldType.Integer,
          isMultiple: false,
        },
      } as unknown as IFormulaParamMetadata,
    ];
    query.setCallMetadata(numericMetadata);

    const lenSql = query.len('"AutoNumber"');
    const lowerSql = query.lower('"AutoNumber"');
    const upperSql = query.upper('"AutoNumber"');
    const trimSql = query.trim('"AutoNumber"');
    const reptSql = query.rept('"AutoNumber"', '3');

    [lenSql, lowerSql, upperSql, trimSql, reptSql].forEach((sql) => {
      expect(sql).toContain('::text');
    });
  });

  it('casts nested text IF chains without recursive JSON coercion', () => {
    const nestedIf = (depth: number): string => {
      query.setCallMetadata([
        { type: 'boolean', isFieldReference: false } as unknown as IFormulaParamMetadata,
        { type: 'string', isFieldReference: false } as unknown as IFormulaParamMetadata,
        { type: 'string', isFieldReference: false } as unknown as IFormulaParamMetadata,
      ]);
      const result =
        depth === 0 ? `'leaf'` : query.if('1', `'branch_${depth}'`, nestedIf(depth - 1));
      query.setCallMetadata(undefined);
      return result;
    };

    const sql = nestedIf(8);

    expect(sql).not.toContain('jsonb_typeof');
    expect(sql).not.toContain('to_jsonb');
    expect(sql.length).toBeLessThan(5000);
  });

  const dateAddCases: Array<{ literal: string; unit: string; factor: number }> = [
    { literal: 'millisecond', unit: 'millisecond', factor: 1 },
    { literal: 'milliseconds', unit: 'millisecond', factor: 1 },
    { literal: 'ms', unit: 'millisecond', factor: 1 },
    { literal: 'second', unit: 'second', factor: 1 },
    { literal: 'seconds', unit: 'second', factor: 1 },
    { literal: 'sec', unit: 'second', factor: 1 },
    { literal: 'secs', unit: 'second', factor: 1 },
    { literal: 'minute', unit: 'minute', factor: 1 },
    { literal: 'minutes', unit: 'minute', factor: 1 },
    { literal: 'min', unit: 'minute', factor: 1 },
    { literal: 'mins', unit: 'minute', factor: 1 },
    { literal: 'hour', unit: 'hour', factor: 1 },
    { literal: 'hours', unit: 'hour', factor: 1 },
    { literal: 'hr', unit: 'hour', factor: 1 },
    { literal: 'hrs', unit: 'hour', factor: 1 },
    { literal: 'day', unit: 'day', factor: 1 },
    { literal: 'days', unit: 'day', factor: 1 },
    { literal: 'week', unit: 'week', factor: 1 },
    { literal: 'weeks', unit: 'week', factor: 1 },
    { literal: 'month', unit: 'month', factor: 1 },
    { literal: 'months', unit: 'month', factor: 1 },
    { literal: 'quarter', unit: 'month', factor: 3 },
    { literal: 'quarters', unit: 'month', factor: 3 },
    { literal: 'year', unit: 'year', factor: 1 },
    { literal: 'years', unit: 'year', factor: 1 },
  ];

  it.each(dateAddCases)(
    'dateAdd normalizes unit "%s" to "%s" for generated columns',
    ({ literal, unit, factor }) => {
      const sql = query.dateAdd('date_col', 'count_expr', `'${literal}'`);
      const scaled = factor === 1 ? '(count_expr)' : `(count_expr) * ${factor}`;
      expect(sql).toBe(`${castTs('date_col')} + (${scaled}) * INTERVAL '1 ${unit}'`);
    }
  );

  it('dateAdd with numeric literal count avoids regex and remains immutable', () => {
    const sql = query.dateAdd('"Chuang_Jian_Ri_Qi"', '-7', `'day'`);

    expect(sql).toContain("INTERVAL '1 day'");
    expect(sql).not.toContain('REGEXP_REPLACE');
  });

  const diffSeconds = `(EXTRACT(EPOCH FROM ${castTs('date_start')} - ${castTs('date_end')}))`;
  const datetimeDiffCases: Array<{ literal: string; expected: string }> = [
    {
      literal: 'millisecond',
      expected: `${diffSeconds} * 1000`,
    },
    {
      literal: 'milliseconds',
      expected: `${diffSeconds} * 1000`,
    },
    {
      literal: 'ms',
      expected: `${diffSeconds} * 1000`,
    },
    {
      literal: 'second',
      expected: `${diffSeconds}`,
    },
    {
      literal: 'seconds',
      expected: `${diffSeconds}`,
    },
    {
      literal: 'sec',
      expected: `${diffSeconds}`,
    },
    {
      literal: 'secs',
      expected: `${diffSeconds}`,
    },
    {
      literal: 'minute',
      expected: `${diffSeconds} / 60`,
    },
    {
      literal: 'minutes',
      expected: `${diffSeconds} / 60`,
    },
    {
      literal: 'min',
      expected: `${diffSeconds} / 60`,
    },
    {
      literal: 'mins',
      expected: `${diffSeconds} / 60`,
    },
    {
      literal: 'hour',
      expected: `${diffSeconds} / 3600`,
    },
    {
      literal: 'hours',
      expected: `${diffSeconds} / 3600`,
    },
    {
      literal: 'hr',
      expected: `${diffSeconds} / 3600`,
    },
    {
      literal: 'hrs',
      expected: `${diffSeconds} / 3600`,
    },
    {
      literal: 'week',
      expected: `${diffSeconds} / (86400 * 7)`,
    },
    {
      literal: 'weeks',
      expected: `${diffSeconds} / (86400 * 7)`,
    },
    {
      literal: 'day',
      expected: `${diffSeconds} / 86400`,
    },
    {
      literal: 'days',
      expected: `${diffSeconds} / 86400`,
    },
  ];

  it.each(datetimeDiffCases)('datetimeDiff normalizes unit "%s"', ({ literal, expected }) => {
    const sql = query.datetimeDiff('date_start', 'date_end', `'${literal}'`);
    expect(sql).toBe(expected);
  });

  const isSameCases: Array<{ literal: string; expectedUnit: string }> = [
    { literal: 'millisecond', expectedUnit: 'millisecond' },
    { literal: 'milliseconds', expectedUnit: 'millisecond' },
    { literal: 'ms', expectedUnit: 'millisecond' },
    { literal: 'second', expectedUnit: 'second' },
    { literal: 'seconds', expectedUnit: 'second' },
    { literal: 'sec', expectedUnit: 'second' },
    { literal: 'secs', expectedUnit: 'second' },
    { literal: 'minute', expectedUnit: 'minute' },
    { literal: 'minutes', expectedUnit: 'minute' },
    { literal: 'min', expectedUnit: 'minute' },
    { literal: 'mins', expectedUnit: 'minute' },
    { literal: 'hour', expectedUnit: 'hour' },
    { literal: 'hours', expectedUnit: 'hour' },
    { literal: 'hr', expectedUnit: 'hour' },
    { literal: 'hrs', expectedUnit: 'hour' },
    { literal: 'day', expectedUnit: 'day' },
    { literal: 'days', expectedUnit: 'day' },
    { literal: 'week', expectedUnit: 'week' },
    { literal: 'weeks', expectedUnit: 'week' },
    { literal: 'month', expectedUnit: 'month' },
    { literal: 'months', expectedUnit: 'month' },
    { literal: 'quarter', expectedUnit: 'quarter' },
    { literal: 'quarters', expectedUnit: 'quarter' },
    { literal: 'year', expectedUnit: 'year' },
    { literal: 'years', expectedUnit: 'year' },
  ];

  it.each(isSameCases)('isSame normalizes unit "%s"', ({ literal, expectedUnit }) => {
    const sql = query.isSame('date_a', 'date_b', `'${literal}'`);
    expect(sql).toBe(
      `DATE_TRUNC('${expectedUnit}', ${castTs('date_a')}) = DATE_TRUNC('${expectedUnit}', ${castTs('date_b')})`
    );
  });

  it('coerces JSON operands before comparing to text columns', () => {
    const tableStub = {
      fieldList: [
        { dbFieldName: 'text_col', dbFieldType: DbFieldType.Text },
        { dbFieldName: 'json_col', dbFieldType: DbFieldType.Json },
      ],
    } as unknown as TableDomain;

    query.setContext({
      table: tableStub,
      isGeneratedColumn: true,
    });

    const sql = query.equal('"text_col"', '"json_col"');

    expect(sql).toContain('pg_typeof(("json_col")) = ANY');
    expect(sql).toContain('jsonb_typeof((("json_col"))::jsonb)');
    expect(sql).toContain('("text_col")::text');
  });

  it('short-circuits boolean normalization when metadata guarantees a boolean param', () => {
    const booleanMetadata = [
      {
        type: 'boolean',
        field: {
          dbFieldName: 'BoolField',
          dbFieldType: DbFieldType.Boolean,
          isMultiple: false,
        },
      } as unknown as IFormulaParamMetadata,
    ];

    query.setCallMetadata(booleanMetadata);

    const sql = query.if('"BoolField"', "'yes'", "'no'");

    expect(sql).toContain('COALESCE(("BoolField")::boolean, FALSE)');
    expect(sql).not.toContain('pg_typeof(("BoolField"))');
  });

  it('recognizes boolean db columns even when param type is unknown', () => {
    const booleanMetadata = [
      {
        type: 'unknown',
        isFieldReference: true,
        field: {
          dbFieldName: 'BoolField',
          dbFieldType: DbFieldType.Boolean,
          cellValueType: undefined,
          isMultiple: false,
        },
      } as unknown as IFormulaParamMetadata,
    ];

    query.setCallMetadata(booleanMetadata);

    const sql = query.if('"BoolField"', "'yes'", "'no'");

    expect(sql).toContain('COALESCE(("BoolField")::boolean, FALSE)');
    expect(sql).not.toContain('pg_typeof(("BoolField"))');
  });

  it('avoids regex coercion for numeric columns when metadata is numeric', () => {
    const numericMetadata = [
      {
        type: 'number',
        isFieldReference: true,
        field: {
          dbFieldName: 'Amount',
          dbFieldType: DbFieldType.Real,
          cellValueType: 'number',
          isMultiple: false,
        },
      } as unknown as IFormulaParamMetadata,
    ];

    query.setCallMetadata(numericMetadata);

    const sql = query.if('"Amount"', "'yes'", "'no'");

    expect(sql).toContain('COALESCE(("Amount")::double precision, 0) <> 0');
    expect(sql).not.toContain('REGEXP_REPLACE');
  });

  it('falls back to truthy normalization when metadata is unavailable', () => {
    query.setCallMetadata(undefined);
    const sql = query.if('"text_col"', "'yes'", "'no'");
    expect(sql).toContain('pg_typeof("text_col")::text');
  });

  it('avoids regex coercion for unary minus numeric literals', () => {
    query.setCallMetadata(undefined);
    const sql = query.value(query.unaryMinus('7'));

    expect(sql).not.toContain('REGEXP_REPLACE');
  });

  it('collates regex-based numeric coercion to avoid collation conflicts', () => {
    query.setCallMetadata(undefined);
    const sql = query.value('"text_col"');

    expect(sql).toContain('REGEXP_REPLACE');
    expect(sql).toContain('COLLATE "C"');
    expect(sql).toContain('~ \'^[+-]{0,1}(\\d+(\\.\\d+){0,1}|\\.\\d+)$\' COLLATE "C"');
  });
});
