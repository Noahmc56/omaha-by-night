import fs from 'node:fs'
import YAML from 'yaml'
const url = new URL(process.env.PAGES_BASE_URL)
if (url.protocol !== 'https:') throw new Error('Expected the HTTPS base URL supplied by GitHub Pages')
const config = YAML.parse(fs.readFileSync('quartz.config.yaml', 'utf8'))
config.configuration.baseUrl = `${url.host}${url.pathname}`.replace(/\/$/, '')
fs.writeFileSync('quartz.config.yaml', YAML.stringify(config))
