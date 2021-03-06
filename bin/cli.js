'use strict'

const fs = require('fs')
const opn = require('opn')
const url = require('url')
const path = require('path')
const http = require('http')
const exec = require('child_process').exec
const yargs = require('yargs')

class CLI {
  constructor (args) {
    this.parseArguments(args)
    this.port = this.args.extension || 1337
    this.prefix = 'ws://'
    this.devtools = 'chrome-devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws='
    this.image = { path: '../extension/icon.png', type: 'image/png' }
    this.index = { path: '../extension/index.html', type: 'text/html' }
    this.caught = false
    this.browser = `google chrome ${this.args.canary ? 'canary' : ''}`.trim()
  }

  get props () {
    return {
      args: this.args,
      browser: this.browser,
      port: this.port
    }
  }

  parseArguments (args) {
    this.args = yargs
      .version()
      .demandCommand(1)
      .usage('rawkit [options] <file ...>')
      .alias('v', 'version')
      .version(() => require('../package').version)
      .describe('v', 'show version information')
      .alias('h', 'help')
      .help('help')
      .usage('Usage: $0 -x [num]')
      .showHelpOnFail(false, 'Specify --help for available options')
      .option('canary', {
        alias: 'c',
        describe: 'Run the devtools in canary.',
        boolean: true
      })
      .option('nodemon', {
        alias: 'nm',
        describe: 'Use nodemon.',
        boolean: true
      })
      .option('inspect-brk', {
        alias: 'brk',
        describe: 'To break on the first line of the application code.',
        boolean: true
      })
      .option('inspect-port', {
        alias: 'p',
        describe: 'Debug port. Defaults to 9229. (Passes through to node)',
        type: 'number'
      })
      .option('silent', {
        alias: 's',
        describe: 'Hide stdout/stderr output from child process.',
        boolean: true
      })
      .option('extension', {
        alias: 'e',
        describe: 'Define a specific port to run the extension server on. Defaults to 1337.',
        type: 'number'
      })
      .parse(args)
  }

  parseURL (str) {
    let re = /(\b(ws?|chrome-devtools):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig
    let matches = str.match(re)
    let link = (matches) ? matches[0] : null
    let isNew = link && link.indexOf(this.prefix) >= 0
    return (isNew) ? `${this.devtools}${link.replace(this.prefix, '')}` : link
  }

  exec () {
    let binary = this.args.nodemon ? 'nodemon' : 'node'
    let o = process.argv
    let args = o.splice(o.indexOf(this.args._[2]), o.length).join(' ')
    let cmd = (this.args.brk) ? '--inspect-brk' : '--inspect'
    if (this.args.inspectPort) {
      cmd += ` --inspect-port=${this.args.inspectPort}`
    }
    this.child = exec(`${binary} ${cmd} ${args}`, { shell: true })
    this.child.stdout.on('data', this.handle.bind(this))
    this.child.stderr.on('data', this.handle.bind(this))
    this.child.on('close', _ => process.exit())
    process.on('exit', _ => this.child.kill())
  }

  handle (data) {
    let ref = this.parseURL(data)
    if (!this.caught && ref && !this.args['no-prompt']) {
      let link = `http://localhost:${this.port}/?rawkit=${encodeURIComponent(ref)}`
      let opts = {
        app: [this.browser],
        wait: false
      }
      opn(link, opts)
        .then(() => {})
        .catch((e) => {})
      this.caught = true
      if (!this.args.silent) {
        console.log('\x1b[33m%s\x1b[0m', 'Devtools URL:', ref)
      }
    } else if (!this.args.silent) {
      process.stdout.write(data)
    }
  }

  start () {
    this.server = http.createServer()
    this.server.on('request', (req, res) => {
      let request = url.parse(req.url, true)
      let image = request.pathname.indexOf('.png') >= 0
      let file = (image) ? this.image : this.index
      fs.readFile(path.resolve(__dirname, file.path), (err, data) => {
        if (err) throw err
        res.writeHead(200, { 'Content-Type': file.type })
        if (image) {
          res.end(data, 'binary')
        } else {
          res.end(data.toString())
        }
      })
    }).listen(this.port)
  }
}

module.exports = (args) => {
  return new CLI(args)
}
