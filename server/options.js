export function parseOptions(args) {
  const options = { directory: '.', port: 3220, portSpecified: false, open: true }
  for (let i = 0; i < args.length; i++) {
    const [key, inline] = args[i].split(/=(.*)/s)
    if (['--help', '-h'].includes(key)) options.help = true
    else if (['--version', '-v'].includes(key)) options.version = true
    else if (key === '--no-open') options.open = false
    else if (['--dir', '-d', '--port', '-p'].includes(key)) {
      const value = inline ?? args[++i]
      if (!value || value.startsWith('-')) throw new Error(`${key} 缺少参数`)
      if (key === '--dir' || key === '-d') options.directory = value
      else {
        if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error('端口必须为 0–65535 的整数')
        options.port = Number(value); options.portSpecified = true
      }
    } else throw new Error(`未知参数：${key}，使用 --help 查看帮助`)
  }
  return options
}
