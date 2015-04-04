import { join } from 'path'
import { readFileSync as read, writeFileSync as write } from 'fs'
import { merge, partialRight, flatten, concat, values, mapObj, map, compose, filter, not } from 'ramda'
import Debug from 'debug'
import Jade from 'jade'

export default create



read = partialRight(read, 'utf8')
let path = join.bind(null, __dirname)
path.template = path.bind('../templates')
let log = Debug('webpack-plugin-bootstrap')

let defaultConfig = {
  output: {
    fileName: 'index.html'
  },
  locals: {},
  compile: {
    pretty: true,
    doctype: 'html'
  }
}



function create(customConfig = {}) {
  let config = merge(defaultConfig, customConfig)
  log('config', config)

  return { apply }

  function apply(compiler) {
    log('Hello World!')
    compiler.plugin('emit', (c, cb) => {
      let stats = c.getStats().toJson()
      let publicPath = getPublicPath(c)
      let prependPublicPath = concat(publicPath)
      log('compilation', Object.keys(c))
      log('options', Object.keys(c.options))
      log('_plugins', c._plugins)
      log('stats', Object.keys(stats))
      log('options.output', c.options.output)
      log('options.devServer', c.options.devServer)
      log('stats.assets', stats.assets)
      log('publicPath', publicPath)
      log('hotUpdateChunkTemplate', c.hotUpdateChunkTemplate)

      let jsAssets = flatten(map(getPublicAssets, values(stats.assetsByChunkName)))
      log('jsAssets', jsAssets)

      /* If using hot-enabled webpack-dev-server then add its necessary runtime script
      to jsAssets so that it is automatically included in our final html. */

      if (c.options.devServer && c.options.devServer.hot) {
        jsAssets.push('/webpack-dev-server.js')
      }

      /* Resolve template locals. */

      let locals = merge({
        assetTypesAssetPaths: {
          js: jsAssets
        },
        title: 'App',
        headers: {
          mobile: true,
          utf8: true
        },
        react: {
          mainGlobalIdentifier: 'Main'
          // + Dynamically Resolved Fields.
        },
        mainElement: {
          id: 'main'
        }
      }, config.locals)

      locals.mainQuerySelector = locals.mainElement ? `#${locals.mainElement.id}` : 'body'

      /* Generate HTML contents. */

      let templateSource = read(path.template('default.jade'))
      log('template', templateSource)

      let template = Jade.compile(templateSource, config.compile)
      let html = template(locals)
      log('html', html)

      /* Add HTML asset to build. */

      c.assets[config.output.fileName] = {
        source() { return html },
        size() { return html.length }
      }

      cb()

      function getPublicAssets(assets) {
        return map(prependPublicPath, filter(isntSourceMapFile, assets))
      }
    })
  }
}



let isntSourceMapFile = compose(not, isSourceMapFile)

function isSourceMapFile(fileName) {
  return /\.map$/.test(fileName)
}

function getPublicPath(compilation) {
  let { options } = compilation

  let { devServer } = options
  if (devServer.publicPath) return devServer.publicPath

  let { publicPath } = options
  if (publicPath) return publicPath

  return '/'
}
