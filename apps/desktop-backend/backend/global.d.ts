declare namespace NodeJS {
  interface Global {
    startupUrl: string | null
  }
}

interface Appdata {
  token: string | null
  hideGuide: boolean
}
