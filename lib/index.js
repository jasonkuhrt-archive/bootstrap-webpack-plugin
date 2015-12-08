import Path from 'path'
import {
  readFileSync,
} from 'fs'
import Debug from 'debug'
import Jade from 'jade'
import F, {
  __ as _,
  tap,
  groupBy,
  nth,
  match,
  partial,
  partialRight,
  flatten,
  concat,
  values,
  mapObj,
  map,
  compose as $$,
  filter,
  not,
} from 'ramda'
import merge from 'lodash.merge'



const read = partialRight(readFileSync, 'utf8')

const path = partial(Path.join, __dirname)

path.template = partial(path, '../templates')

const log = Debug('webpack-plugin-bootstrap')

const parseFileType = F.compose(
  /* nth(1) because match returns the whole matching regex as index 0
  with matching groups as added indexes thereafter. */
  F.nth(1),
  // Reference for pattern: http://regexr.com/3aomt
  F.match(/\.([^.?]+)(?:\?.*)*$/)
)



const getPublicPath = (compilation) => {
  const { options } = compilation

  const { devServer } = options
  if (devServer && devServer.publicPath) return devServer.publicPath

  const { output } = options
  if (output && output.publicPath) return output.publicPath

  // TODO seems like a non-standard place to look.
  const { publicPath } = options
  if (publicPath) return publicPath

  return '/'
}



const defaultConfig = {
  meta: {
    charset: 'UTF-8',
    viewport: (
      'width=device-width, \
      initial-scale=1, \
      minimum-scale=1.0, \
      maximum-scale=1.0, \
      user-scalable=no'
    ),
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes'
  },
  compile: {
    pretty: true,
    doctype: 'html'
  },
}




const notSourceMapFile = F.compose(F.not, F.match(/\.map$/))

/* TODO: This pipeline is brittle. It will throw an error if any given
asset is not a valid file name; specifically any string without an
extension will break this pipeline. To fix this we should use a Maybe
Type to branch on the match logic. */

//    getAssetsByEntry :: String -> String -> EntryChunks -> EntryAssets
const getAssetsByEntry = F.curry((publicPath, hash) => (
  F.compose(
    F.groupBy(parseFileType),
    F.map((fileName) => `${publicPath}${fileName}?${hash}`),
    F.filter(notSourceMapFile)
  )
))

const isHotMode = (c) => (
  c.options.devServer && c.options.devServer.hot
)

const addChunkDevServer = (entry) => {
  entry.js = entry.js || []
  entry.js.push('/webpack-dev-server.js')
  return entry
}

const addAssetHTML = (buildAssets, fileName, source) => (
  Object.assign(buildAssets, {
    [fileName]: {
      source () { return source },
      size () { return source.length }
    }
  })
)


const createTemplateSource = (customTemplate = null) => {
  let fileName = path.template('./default.jade')
  let templateSource = read(fileName)

  if (customTemplate) {
    fileName = customTemplate
    templateSource = read(customTemplate)

    /* Our API is designed such that the custom template must
    extend a base layout. To achieve this we use Jade's `extend`
    inheritance feature which requires a relative file path from source file location to the parent being extended. */

    const parentTemplatePath = Path.relative(
      Path.dirname(customTemplate),
      path.template('default.jade')
    )
    templateSource = `extends ${parentTemplatePath}\n\n${templateSource}`
  }

  return [fileName, templateSource]
}



const createTemplate = (settingsBase, templateExtension = null) => {

  /* Note regarding Base Settings. It allow the user to set options
  documented in the Jade docs here http://jade-lang.com/api.
  The filename setting is required but actually an implementation
  detail from _our_ user's point of view. Therefore we combine the
  optional high-level options with this automatically resolved
  low-level option. */

  const [filename,
         source] = createTemplateSource(templateExtension)
  const settings = merge({}, { filename }, settingsBase)
  const template = Jade.compile(source, settings)
  return template
}



const create = (customConfig = {}) => {
  const config = merge({}, defaultConfig, customConfig)
  log('config', config)

  const apply = (compiler) => {
    compiler.plugin('emit', (c, cb) => {
      let entries
      const stats = c.getStats().toJson()

      //log('compilation', Object.keys(c))
      //log('options', Object.keys(c.options))
      //log('stats', Object.keys(stats))
      //log('options.output', c.options.output)
      //log('options.devServer', c.options.devServer)
      //log('stats.assetsByChunkName', stats.assetsByChunkName)
      //log('stats.assets', stats.assets)
      // log('publicPath', publicPath)

      try {
        /* stats.assetsByChunkName is a mapping of entries to chunks.
        For example if User had configured:

        `{ entry: { foo: 'bar' }, ...}`

        then the mapping would at least contain:

        `{ foo: ['bar'] }`.
        */
        entries = F.mapObj(
          getAssetsByEntry(getPublicPath(c), stats.hash),
          stats.assetsByChunkName
        )
      } catch(e) {
        throw new Error(`Failed to process public assets: ${e.message}`)
      }

      log('entries', entries)

      /* If using hot-enabled webpack-dev-server then add its necessary runtime script to jsAssets so that it is automatically included in
      our final html. */

      if (isHotMode(c)) F.mapObj(entries, addChunkDevServer)

      /* Generate the Jade template. */

      const template = createTemplate(config.templateExtension)

      /* Generate the HTML */

      F
      .toPairs(entries)
      .forEach(([name, assetTypesAssetPaths]) => {

        const locals = merge({
          assetTypesAssetPaths,
          title: name,
          attributes: {
            html: {},
            head: {},
            body: {}
          },
          headers: {
            mobile: true,
            utf8: true
          },
          react: {
            mainGlobalIdentifier: 'Main',
            autoRender: true
            // + Dynamically Resolved Fields.
          },
          mainElement: {
            id: 'main'
          }
        }, config)

        locals.mainQuerySelector = (
          locals.mainElement ? `#${locals.mainElement.id}` : 'body'
        )

        addAssetHTML(c.assets, `${name}.html`, template(locals))
      })

      cb()

    })
  }

  return {
    apply
  }
}




export default create
