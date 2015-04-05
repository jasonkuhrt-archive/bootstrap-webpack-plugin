import Path from 'path'
import { readFileSync } from 'fs'
import { __ as _, tap, groupBy, nth, match, merge, partial, partialRight, flatten, concat, values, mapObj, map, compose as $$, filter, not } from 'ramda'
import Debug from 'debug'
import Jade from 'jade'

export default create



let read = partialRight(readFileSync, 'utf8')
let path = partial(Path.join, __dirname)
path.template = partial(path, '../templates')
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

// http://regexr.com/3aomt
let fileExtRegEx = /\.([^.?]+)(?:\?.*)*$/

function create(customConfig = {}) {
  let config = merge(defaultConfig, customConfig)
  log('config', config)

  return { apply }

  function apply(compiler) {
    compiler.plugin('emit', (c, cb) => {
      let stats = c.getStats().toJson()
      let publicPath = getPublicPath(c)
      let hashQuery = `?${stats.hash}`

      /* TODO: This pipeline is brittle. It will throw an error if any given
      asset is not a valid file name; specifically any string without an
      extension will break this pipeline. To fix this we should use a Maybe
      Type to branch on the match logic. */

      let getPublicAssets = $$(
        /* nth(1) because match returns the whole matching regex as index 0
        with matching groups as added indexes thereafter. */
        groupBy($$(nth(1), match(fileExtRegEx))),
        map($$(concat(_, hashQuery), concat(publicPath))),
        filter($$(not, match(/\.map$/))),
        flatten,
        values
      )

      log('compilation', Object.keys(c))
      log('options', Object.keys(c.options))
      log('_plugins', c._plugins)
      log('stats', Object.keys(stats))
      log('options.output', c.options.output)
      //log('options.devServer', c.options.devServer)
      log('stats.assetsByChunkName', stats.assetsByChunkName)
      log('stats.assets', stats.assets)
      log('publicPath', publicPath)

      try {
        var assetTypesAssetPaths = getPublicAssets(stats.assetsByChunkName)
      } catch(e) {
        throw new Error(`Failed to process public assets: ${e.message}`)
      }

      log('assetTypesAssetPaths', assetTypesAssetPaths)

      /* If using hot-enabled webpack-dev-server then add its necessary runtime script
      to jsAssets so that it is automatically included in our final html. */

      if (c.options.devServer && c.options.devServer.hot) {
        assetTypesAssetPaths.js = assetTypesAssetPaths.js || []
        assetTypesAssetPaths.js.push('/webpack-dev-server.js')
      }

      /* Resolve template locals. */

      let locals = merge({
        assetTypesAssetPaths,
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

      if (config.templateExtension) {
        var fileName = config.templateExtension
        let basedir = Path.dirname(config.templateExtension)
        var templateSource = read(config.templateExtension)
        let extendsJadeCode = Path.relative(basedir, path.template('default.jade'))
        templateSource = `extends ${extendsJadeCode}\n\n${templateSource}`
      } else {
        var fileName = path.template(fileName)
        var templateSource = read(fileName)
      }

      config.compile.filename = fileName
      let template = Jade.compile(templateSource, config.compile)
      let html = template(locals)
      log('html', html)

      /* Add HTML asset to build. */

      c.assets[config.output.fileName] = {
        source() { return html },
        size() { return html.length }
      }

      cb()

    })
  }
}



function getPublicPath(compilation) {
  let { options } = compilation

  let { devServer } = options
  if (devServer.publicPath) return devServer.publicPath

  let { publicPath } = options
  if (publicPath) return publicPath

  return '/'
}
