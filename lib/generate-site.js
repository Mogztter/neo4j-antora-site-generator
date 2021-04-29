'use strict'

const aggregateContent = require('@antora/content-aggregator')
const buildNavigation = require('@antora/navigation-builder')
const buildPlaybook = require('@antora/playbook-builder')
const classifyContent = require('@antora/content-classifier')
const convertDocuments = require('@antora/document-converter')
const createPageComposer = require('@antora/page-composer')
const loadUi = require('@antora/ui-loader')
const mapSite = require('@antora/site-mapper')
const produceRedirects = require('@antora/redirect-producer')
const publishSite = require('@antora/site-publisher')
const { resolveAsciiDocConfig } = require('@antora/asciidoc-loader')
const knowledgeBase = require('./knowledge-base')
const training = require('./training')
const {
  addGraphGistPages,
  addGraphGistCategoryPages,
  addGraphGistIndexPage,
  generateJupyterNotebookAttachments,
  assignPageAttributes,
} = require('./graphgists')
const { getLiveGraphGists } = require('./graphgists/graphql-api')

async function generateSite (args, env) {
  const playbook = buildPlaybook(args, env)
  const asciidocConfig = resolveAsciiDocConfig(playbook)
  const siteComponent = asciidocConfig.attributes['site-component'] || ''
  const [contentCatalog, uiCatalog, graphGists] = await Promise.all([
    aggregateContent(playbook).then((contentAggregate) => classifyContent(playbook, contentAggregate, asciidocConfig)),
    loadUi(playbook),
    siteComponent === 'graphgists' ? getLiveGraphGists() : Promise.resolve({}),
  ])
  if (siteComponent === 'graphgists') {
    addGraphGistPages(graphGists, contentCatalog, asciidocConfig)
  }
  const pages = convertDocuments(contentCatalog, asciidocConfig)
  if (siteComponent === 'graphgists') {
    generateJupyterNotebookAttachments(graphGists, contentCatalog)
    addGraphGistCategoryPages(graphGists, pages, contentCatalog, asciidocConfig)
    assignPageAttributes(graphGists, contentCatalog, asciidocConfig)
    addGraphGistIndexPage(graphGists, pages, contentCatalog, asciidocConfig)
  }
  knowledgeBase.generateKnowledgeBasePageDescription(pages)
  knowledgeBase.addCategoryPages(pages, contentCatalog, asciidocConfig)
  knowledgeBase.addTagPages(pages, contentCatalog, asciidocConfig)
  const navigationCatalog = buildNavigation(contentCatalog, asciidocConfig)
  training.attachNavigationSlug(contentCatalog, navigationCatalog)
  const composePage = createPageComposer(playbook, contentCatalog, uiCatalog, env)
  pages.forEach((page) => composePage(page, contentCatalog, navigationCatalog))
  const siteFiles = [...mapSite(playbook, pages), ...produceRedirects(playbook, contentCatalog)]
  if (playbook.site.url) siteFiles.push(composePage(create404Page()))
  const siteCatalog = { getFiles: () => siteFiles }
  return publishSite(playbook, [contentCatalog, uiCatalog, siteCatalog])
}

function create404Page () {
  return {
    title: 'Page Not Found',
    mediaType: 'text/html',
    src: { stem: '404' },
    out: { path: '404.html' },
    pub: { url: '/404.html', rootPath: '' },
  }
}

module.exports = generateSite
