import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import { terser } from 'rollup-plugin-terser';
import strip from '@rollup/plugin-strip';

import pkg from './package.json';

const debug = process.env.NODE_ENV !== 'production';

export default {
    input: 'src/index.ts',
    output: [
        {
            format: 'es',
            file: pkg.module,
            sourcemap: debug ? true : false,
        },
    ],
    external: [...Object.keys(pkg.peerDependencies || {})],
    plugins: [
        nodeResolve(),
        typescript({
            typescript: require('typescript'),
            sourceMap: debug,
        }),
        !debug && strip({
            include: ['**/*.ts', '**/*.tsx', '**/*.js'],
            debugger: true,
            functions: ['console.trace', 'console.debug'],
        }),
        !debug && terser({
            format: {
                comments: false
            },
            compress: true
        }),
    ],
};
