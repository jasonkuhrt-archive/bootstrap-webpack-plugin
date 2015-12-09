import F from 'ramda'



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

const parseFileType = F.compose(
  /* nth(1) because match returns the whole matching regex as index 0
  with matching groups as added indexes thereafter. */
  F.nth(1),
  /* Reference for pattern: http://regexr.com/3aomt */
  F.match(/\.([^.?]+)(?:\?.*)*$/)
)

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



export default {
  getPublicPath,
  isHotMode,
  addChunk,
  addChunkDevServer,
  addAssetHTML,
  getAssetsByEntry,
}
export {
  isHotMode,
  addChunk,
  addChunkDevServer,
  getPublicPath,
  addAssetHTML,
  getAssetsByEntry,
}
