// import commonjs from '@rollup/plugin-commonjs';
// import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

export default {
    input: 'src/extension.ts',
    output: [
        // {
        //         file: 'dist/extension.mjs',
        //         format: 'esm',
        //         sourcemap: true
        // },
        // {
        //         file: 'dist/extension.cjs',
        //         format: 'cjs',
        //         sourcemap: true
        // },
        {
            file: 'dist/extension.debug.js',
            name: 'ext',
            format: 'umd',
            sourcemap: true
        },
        {
            file: 'dist/extension.min.js',
            name: 'ext',
            format: 'umd',
            plugins: [terser()]
        }
    ],
    plugins: [
        // resolve(),
        // commonjs(),
        typescript({
            tsconfig: './tsconfig.json',
            declaration: true,
            declarationDir: './dist',
            sourceMap: true
        })
    ]
};
