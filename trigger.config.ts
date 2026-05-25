import { defineConfig } from '@trigger.dev/sdk'
import { syncVercelEnvVars } from '@trigger.dev/build/extensions/core'

export default defineConfig({
  project: 'proj_lgsbkvkrgmhovexfaoxc',
  dirs: ['./src/trigger'],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
    },
  },
  build: {
    extensions: [
      syncVercelEnvVars({ projectId: 'prj_Uy9RQ2hE3XoWeYujXwPiv9eypNUw' }),
    ],
  },
})
