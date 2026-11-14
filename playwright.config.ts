import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  timeout:120_000,
  expect:{timeout:20_000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:[['list'],['json',{outputFile:'test-results/e2e.json'}]],
  outputDir:'test-results',
  use:{
    baseURL:'http://127.0.0.1:4175',
    ...devices['Pixel 7'],
    locale:'zh-CN',
    channel:'chrome',
    headless:true,
    trace:'off',
    video:'off',
    screenshot:'only-on-failure',
  },
  webServer:{
    command:'node scripts/serve-release.mjs dist 4175 /',
    url:'http://127.0.0.1:4175/',
    reuseExistingServer:false,
    timeout:60_000,
  },
});
