export function getTitle(properties: Record<string, any>, key: string): string {
  const prop = properties[key];
  if (!prop || prop.type !== 'title') return '';
  return (prop.title ?? []).map((item: any) => item.plain_text ?? '').join('');
}

export function getNumber(properties: Record<string, any>, key: string): number | null {
  const prop = properties[key];
  if (!prop || prop.type !== 'number') return null;
  return typeof prop.number === 'number' ? prop.number : null;
}

export function getCheckbox(properties: Record<string, any>, key: string): boolean {
  const prop = properties[key];
  if (!prop || prop.type !== 'checkbox') return false;
  return Boolean(prop.checkbox);
}

export function getRichText(properties: Record<string, any>, key: string): string {
  const prop = properties[key];
  if (!prop) return '';

  if (prop.type === 'rich_text') {
    return (prop.rich_text ?? []).map((item: any) => item.plain_text ?? '').join('');
  }

  return '';
}

export function getSelect(properties: Record<string, any>, key: string): string {
  const prop = properties[key];
  if (!prop) return '';

  if (prop.type === 'select') return prop.select?.name ?? '';
  if (prop.type === 'status') return prop.status?.name ?? '';

  return '';
}

export function getMultiSelect(properties: Record<string, any>, key: string): string[] {
  const prop = properties[key];
  if (!prop || prop.type !== 'multi_select') return [];
  return (prop.multi_select ?? []).map((item: any) => item.name).filter(Boolean);
}

export function getRelationIds(properties: Record<string, any>, key: string): string[] {
  const prop = properties[key];
  if (!prop || prop.type !== 'relation') return [];
  return (prop.relation ?? []).map((item: any) => item.id).filter(Boolean);
}
