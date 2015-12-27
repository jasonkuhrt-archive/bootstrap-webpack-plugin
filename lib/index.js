import Path from 'path'
import { readFileSync } from 'fs'
import Jade from 'jade'
import F from 'ramda'
import merge from 'lodash.merge'
import Utils from './webpack-utils'



const read = F.partialRight(readFileSync, ['utf8'])

const path = F.partial(Path.join, [__dirname])

path.template = F.partial(path, ['../templates'])



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



const createRenderer = (pluginJadeOptions, templateExtension = null) => {

  /* Note regarding Base Settings. It allow the user to set options
  documented in the Jade docs here http://jade-lang.com/api.
  The filename setting is required but actually an implementation
  detail from _our_ user's point of view. Therefore we combine the
  optional high-level options with this automatically resolved
  low-level option. */

  const [ filename, source ] = getTemplate(templateExtension)
  const jadeOptions = merge({}, { filename }, pluginJadeOptions)
  const render = Jade.compile(source, jadeOptions)
  return render
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
          Utils.getAssetsByEntry(Utils.getPublicPath(c), stats.hash),
          stats.assetsByChunkName
        )
      } catch(e) {
        throw new Error(`Failed to process public assets: ${e.message}`)
      }

      /* If using hot-enabled webpack-dev-server then add its necessary runtime
      script to jsAssets so that it is automatically included in
      our final html. */

      if (Utils.isHotMode(c)) F.mapObj(entries, Utils.addChunkDevServer)

      /* Generate the Jade rendering function. */

      const render = createRenderer(config.compile, config.templateExtension)

      /* Generate the HTML */

      const isSingleEntry = F.equals(1, F.length(F.keys(entries)))

      F.pipe(
        F.toPairs,
        F.map(entryToTemplateSetting(config)),
        F.forEach((templateSettings) => {
          /* If there is only one entry we use the special name `index` which
          browsers will automatically load when no file is given in the URI. */
          const fileName = isSingleEntry ? 'index.html' : `${templateSettings.name}.html`
          Utils.addAssetHTML(c.assets, fileName, render(templateSettings))
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
