import { register } from 'node:module';

// Resolve this test suite's TypeScript sources without a generated JS tree.
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    try { return await nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        if (specifier.endsWith('.js')) return nextResolve(specifier.slice(0, -3) + '.ts', context);
        if (!specifier.endsWith('.ts') && !specifier.endsWith('.mts')) return nextResolve(specifier + '.ts', context);
      }
      throw error;
    }
  }
`)}`, import.meta.url);
