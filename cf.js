const os = require("os")
const child_process = require("child_process")

function execFileSyncWithCfDialTimeout(file, args = [], options = {}) {
  options["env"] = options["env"] || process.env
  options["env"]["CF_DIAL_TIMEOUT"] = "30"
  return child_process.execFileSync(file, args, options)
}

exports.auth = source => {
  if (process.env.NODE_ENV !== "production") {
    console.log("CF: Non-production: assume we are already logged in")
    return
  }
  const useClientCredentials =
    source.client_id &&
    source.client_id.length > 0 &&
    source.client_secret &&
    source.client_secret.length > 0
  const id = useClientCredentials ? source.client_id : source.username
  const secret = useClientCredentials ? source.client_secret : source.password

  try {
    execFileSyncWithCfDialTimeout("cf", ["api", source.api])
    console.log(`CF: API endpoint set to ${source.api}`)
  } catch (e) {
    throw new Error(`CF: Unable to set API endpoint to ${source.api}`)
  }

  try {
    execFileSyncWithCfDialTimeout(
      "cf",
      [
        "auth",
        id,
        secret,
        useClientCredentials ? "--client-credentials" : null
      ].filter(n => n)
    )
    console.log(
      `CF: Authenticated with ${id} (client-credentials: ${useClientCredentials})`
    )
  } catch (e) {
    throw new Error(
      `CF: Unable to authenticate with ${id} (client-credentials: ${useClientCredentials})`
    )
  }
}

exports.target = ({ organization, space }) => {
  if (!organization || !space) {
    console.log(
      "CF: Organization and/or space not specified. Using target set locally."
    )
    return
  }
  try {
    execFileSyncWithCfDialTimeout("cf", [
      "target",
      "-o",
      organization,
      "-s",
      space
    ])
    console.log(`CF: Targeted ${organization}/${space}`)
  } catch (e) {
    throw new Error(`CF: Unable to target ${organization}/${space}`)
  }
}

exports.appInfo = ({ name, guid }) => {
  try {
    guid =
      guid ||
      execFileSyncWithCfDialTimeout("cf", ["app", "--guid", name])
        .toString()
        .trim()

    const appInfo = execFileSyncWithCfDialTimeout("cf", [
      "curl",
      `/v2/apps/${guid}`
    ]).toString()

    return JSON.parse(appInfo)
  } catch (e) {
    throw new Error(`CF: Application '${name}' not found`)
  }
}

exports.appExists = ({ name }) => {
  try {
    execFileSyncWithCfDialTimeout("cf", ["app", "--guid", name])
    return true
  } catch (e) {
    return false
  }
}

exports.delete = ({ name }) => {
  execFileSyncWithCfDialTimeout("cf", ["delete", name, "-f"])
  console.log(`CF: Deleted ${name}`)
}

exports.rename = ({ from, to, failOnError = true }) => {
  try {
    execFileSyncWithCfDialTimeout("cf", ["rename", from, to])
    console.log(`CF: Renamed ${from} to ${to}`)
  } catch (e) {
    if (failOnError) {
      console.error(`CF: Unable to rename ${from} to ${to}`)
    }
  }
}

exports.push = ({ name, path, manifest, docker_password, noStart = false }) => {
  console.log(`CF: Deploying ${name}...`)
  const env = { ...process.env }
  if (docker_password) {
    env["CF_DOCKER_PASSWORD"] = docker_password
  }

  try {
    execFileSyncWithCfDialTimeout(
      "cf",
      [
        "push",
        name,
        "-f",
        manifest,
        path ? "-p" : null,
        path,
        noStart ? "--no-start" : null
      ].filter(a => a),
      { env, stdio: [null, process.stderr, process.stderr] }
    )
    console.log(`CF: Application ${name} successfully deployed!`)
  } catch (e) {
    throw new Error(`CF: Unable to deploy ${name}!`)
  }
}

exports.start = ({ name }) => {
  console.log(`CF: Starting ${name}...`)
  try {
    execFileSyncWithCfDialTimeout("cf", ["start", name], {
      stdio: [null, process.stderr, process.stderr]
    })
    console.log(`CF: Application ${name} successfully started!`)
  } catch (e) {
    throw new Error(`CF: Unable to start ${name}!`)
  }
}

exports.bindServices = ({ name, services = [] }) => {
  services.forEach(service => {
    console.log(`CF: Binding service ${service.name} to ${name}`)
    if (typeof service.config != "object") {
      throw new Error(
        "CF: Service configuration MUST be provided for ${service.name}"
      )
    }

    const config = JSON.stringify(service.config)
    execFileSyncWithCfDialTimeout(
      "cf",
      ["bind-service", name, service.name, "-c", config],
      { stdio: [null, process.stderr, process.stderr] }
    )
  })
}

exports.log = ({ name }) => {
  try {
    const logs = execFileSyncWithCfDialTimeout("cf", [
      "logs",
      "--recent",
      name
    ]).toString()
    return logs
  } catch (e) {
    throw new Error(`CF: Unable to obtain "${name}" logs`)
  }
}

exports.stop = ({ name }) => {
  try {
    execFileSyncWithCfDialTimeout("cf", ["stop", name])
    console.log(`CF: Application "${name} stopped.`)
  } catch (e) {
    console.warn(`CF: WARNING Unable to stop application "${name}"`)
  }
}
