import Path from 'path'
import { readFileSync } from 'fs'
import Jade from 'jade'
import F from 'ramda'
import merge from 'lodash.merge'



const read = F.partialRight(readFileSync, ['utf8'])

const path = F.partial(Path.join, [__dirname])

path.template = F.partial(path, ['../templates'])

const parseFileType = F.compose(
  /* nth(1) because match returns the whole matching regex as index 0
  with matching groups as added indexes thereafter. */
  F.nth(1),
  /* Reference for pattern: http://regexr.com/3aomt */
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




const notSourceMapFile = F.compose(F.isEmpty, F.match(/\.map$/))

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

const addChunk = F.curry((type, chunk, entry) => {
  /* The chunk _type_ may be new to this entry. */
  Object.assign(entry, { [type]: entry[type] || []})
  entry[type].push(chunk)
  return entry
})

const addChunkDevServer = addChunk('js', '/webpack-dev-server.js')

const addAssetHTML = (buildAssets, fileName, source) => (
  Object.assign(buildAssets, {
    [fileName]: {
      source () { return source },
      size () { return source.length }
    }
  })
)



const getTemplate = (customTemplatePath = null) => {
  let filePath, contents

  if (customTemplatePath) {
    /* Our API is designed such that the custom template must
    extend a base layout. To achieve this we use Jade's `extend`
    inheritance feature which requires a relative file path from source
    file location to the parent being extended. */

    const parentTemplatePath = Path.relative(
      Path.dirname(customTemplatePath),
      path.template('default.jade')
    )
    filePath = customTemplatePath
    contents = `extends ${parentTemplatePath}\n\n${read(customTemplatePath)}`
  } else {
    filePath = path.template('./default.jade')
    contents = read(filePath)
  }

  return [ filePath, contents ]
}



const createTemplate = (settingsBase, templateExtension = null) => {

  /* Note regarding Base Settings. It allow the user to set options
  documented in the Jade docs here http://jade-lang.com/api.
  The filename setting is required but actually an implementation
  detail from _our_ user's point of view. Therefore we combine the
  optional high-level options with this automatically resolved
  low-level option. */

  const [
        filename,
        source ] = getTemplate(templateExtension)
  const settings = merge({}, { filename }, settingsBase)
  const template = Jade.compile(source, settings)
  return template
}



const templateSettingsBase = {
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
}

const entryToTemplateSetting = F.curry((overrides, [ name, assetPathsByType ]) => {
  const settings = merge(
    {},
    templateSettingsBase,
    overrides,
    { assetPathsByType, name }
  )

  return Object.assign(settings, {
    mainQuerySelector: (
      settings.mainElement ? `#${settings.mainElement.id}` : 'body'
    )
  })
})



const create = (customConfig = {}) => {
  const config = merge({}, defaultConfig, customConfig)

  const apply = (compiler) => {
    compiler.plugin('emit', (c, cb) => {
      let entries
      const stats = c.getStats().toJson()

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

      /* If using hot-enabled webpack-dev-server then add its necessary runtime
      script to jsAssets so that it is automatically included in
      our final html. */

      if (isHotMode(c)) F.mapObj(entries, addChunkDevServer)

      /* Generate the Jade template. */

      const template = createTemplate(config.templateExtension)

      /* Generate the HTML */

      const isSingleEntry = F.equals(1, F.length(F.keys(entries)))

      F.pipe(
        F.toPairs,
        F.map(entryToTemplateSetting(config)),
        F.forEach((templateSettings) => {
          /* If there is only one entry we use the special name `index` which
          browsers will automatically load when no file is given in the URI. */
          const fileName = isSingleEntry ? 'index.html' : `${templateSettings.name}.html`
          addAssetHTML(c.assets, fileName, template(templateSettings))
        })
      )(entries)

      cb()

    })
  }

  return {
    apply
  }
}



export default create
