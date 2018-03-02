'use strict';
require('ts-node/register')
const scriptName = process.argv[2];
require(`./bin/${scriptName}.ts`);
