import { buildIndex } from './content.js';

export async function loadContent(fetchFn = fetch) {
  const get = async (path) => {
    const res = await fetchFn(path);
    if (!res.ok) throw new Error(`${path} (${res.status})`);
    return res.json();
  };
  const content = await get('data/content.json');
  if (!Array.isArray(content.worlds)) throw new Error('content.json: worlds 오류');
  const worlds = await Promise.all(content.worlds.map((n) => get(`data/world-${n}.json`)));
  const { index, errors } = buildIndex(content, worlds);
  if (errors.length) throw new Error(errors.slice(0, 5).join('\n'));
  return index;
}
