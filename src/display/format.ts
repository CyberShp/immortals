// Presentation only: never round the simulation or saved values.
export function formatResource(value: number, key: string) {
  return String(key === 'pill' ? Math.trunc(value) : Number(value.toFixed(1)));
}

export function formatResources(values: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      Number(formatResource(value, key)),
    ]),
  );
}

export function formatLog(text: string) {
  const keys: Record<string, string> = {
    灵石: 'stone',
    灵草: 'herb',
    丹药: 'pill',
    声望: 'reputation',
  };
  return text
    .replace(
      /(灵石|灵草|丹药|声望)(\s*[+−-]?\s*)(\d+(?:\.\d+)?)/g,
      (_, label: string, gap: string, value: string) =>
        label + gap + formatResource(Number(value), keys[label]),
    )
    .replace(
      /(\d+(?:\.\d+)?)(\s*(?:枚|份|点)?\s*)(灵石|灵草|丹药|声望)/g,
      (_, value: string, gap: string, label: string) =>
        formatResource(Number(value), keys[label]) + gap + label,
    );
}
