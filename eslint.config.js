import config from 'eslint-config-mourner';

export default [
    ...config,
    {
        files: ['*.js', 'test/test.js', 'bin/pixelmatch']
    }
];
