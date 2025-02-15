'use strict'

const { resolve, join, dirname } = require('path')
const pino = require('pino')
const pretty = require('pino-pretty')
const { loadConfig } = require('./load-config.js')
const { isFileAccessible } = require('./utils.js')

async function getTSCExecutablePath (cwd) {
  const typescriptPath = require.resolve('typescript')
  const typescriptPathCWD = require.resolve('typescript', { paths: [process.cwd()] })

  const tscLocalPath = join(typescriptPath, '..', '..', 'bin', 'tsc')
  const tscGlobalPath = join(typescriptPathCWD, '..', '..', 'bin', 'tsc')

  const [tscLocalExists, tscGlobalExists] = await Promise.all([
    isFileAccessible(tscLocalPath),
    isFileAccessible(tscGlobalPath)
  ])

  /* c8 ignore next 7 */
  if (tscLocalExists) {
    return tscLocalPath
  }

  if (tscGlobalExists) {
    return tscGlobalPath
  }
}

async function setup (cwd, config, logger) {
  if (!logger) {
    logger = pino(
      pretty({
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'hostname,pid'
      })
    )

    if (config?.server.logger) {
      logger.level = config.server.logger.level
    }
  }

  const { execa } = await import('execa')

  const tscExecutablePath = await getTSCExecutablePath(cwd)
  /* c8 ignore next 4 */
  if (tscExecutablePath === undefined) {
    const msg = 'The tsc executable was not found.'
    logger.error(msg)
  }

  const tsconfigPath = resolve(cwd, 'tsconfig.json')
  const tsconfigExists = await isFileAccessible(tsconfigPath)

  if (!tsconfigExists) {
    const msg = 'The tsconfig.json file was not found.'
    logger.error(msg)
  }

  return { execa, logger, tscExecutablePath }
}

async function compile (cwd, config, originalLogger) {
  const { execa, logger, tscExecutablePath } = await setup(cwd, config, originalLogger)
  /* c8 ignore next 3 */
  if (!tscExecutablePath) {
    return false
  }

  try {
    await execa(tscExecutablePath, ['--project', 'tsconfig.json', '--rootDir', '.'], { cwd })
    logger.info('Typescript compilation completed successfully.')
    return true
  } catch (error) {
    logger.error(error.message)
    return false
  }
}

function buildCompileCmd (app) {
  return async function compileCmd (_args) {
    let fullPath = null
    try {
      const { configManager } = await loadConfig({}, _args, app, {
        watch: false
      })
      await configManager.parseAndValidate()
      fullPath = dirname(configManager.fullPath)
      /* c8 ignore next 4 */
    } catch (err) {
      console.error(err)
      process.exit(1)
    }

    if (!await compile(fullPath)) {
      process.exit(1)
    }
  }
}

module.exports.compile = compile
module.exports.buildCompileCmd = buildCompileCmd
