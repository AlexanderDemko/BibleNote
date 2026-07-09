export function visibleBibleRefSql(alias: string, paragraphAlias?: string): string {
  const fragment = paragraphAlias
    ? `AND instr(substr(COALESCE(${paragraphAlias}.text, ''), COALESCE(${alias}.start_index, 0) + 1, COALESCE(${alias}.end_index, ${alias}.start_index) - COALESCE(${alias}.start_index, 0) + 1), '[') = 0
    AND instr(substr(COALESCE(${paragraphAlias}.text, ''), COALESCE(${alias}.start_index, 0) + 1, COALESCE(${alias}.end_index, ${alias}.start_index) - COALESCE(${alias}.start_index, 0) + 1), ']') = 0
    AND instr(substr(COALESCE(${paragraphAlias}.text, ''), COALESCE(${alias}.start_index, 0) + 1, COALESCE(${alias}.end_index, ${alias}.start_index) - COALESCE(${alias}.start_index, 0) + 1), '{') = 0
    AND instr(substr(COALESCE(${paragraphAlias}.text, ''), COALESCE(${alias}.start_index, 0) + 1, COALESCE(${alias}.end_index, ${alias}.start_index) - COALESCE(${alias}.start_index, 0) + 1), '}') = 0`
    : '';
  return `COALESCE(${alias}.entry_options, 'None') NOT IN ('IsExcluded', 'InSquareBrackets')
    AND COALESCE(${alias}.entry_options, '') NOT LIKE '%Excluded%'
    AND COALESCE(${alias}.entry_options, '') NOT LIKE '%Square%'
    AND COALESCE(${alias}.entry_options, '') NOT LIKE '%Curly%'
    AND COALESCE(${alias}.entry_options, '') NOT LIKE '%Bracket%'
    AND COALESCE(${alias}.entry_options, '') NOT LIKE '%Brace%'
    AND COALESCE(${alias}.entry_type, '') NOT LIKE '%Excluded%'
    AND COALESCE(${alias}.entry_type, '') NOT LIKE '%Square%'
    AND COALESCE(${alias}.entry_type, '') NOT LIKE '%Curly%'
    AND COALESCE(${alias}.entry_type, '') NOT LIKE '%Bracket%'
    AND COALESCE(${alias}.entry_type, '') NOT LIKE '%Brace%'
    AND TRIM(COALESCE(${alias}.original_text, '')) NOT LIKE '[%'
    AND TRIM(COALESCE(${alias}.original_text, '')) NOT LIKE '{%'
    ${fragment}`;
}

export function visibleBibleScopeSql(pageAlias: string, sectionAlias?: string): string {
  const values = [
    `COALESCE(${pageAlias}.title, '')`,
    `COALESCE(${pageAlias}.parent_section_name, '')`
  ];
  if (sectionAlias) values.push(`COALESCE(${sectionAlias}.section_group_path, '')`);
  return values.map(value => `instr(${value}, '[') = 0
    AND instr(${value}, ']') = 0
    AND instr(${value}, '{') = 0
    AND instr(${value}, '}') = 0`).join('\n    AND ');
}
