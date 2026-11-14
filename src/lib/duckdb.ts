import * as duckdb from '@duckdb/duckdb-wasm'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

export interface Db {
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
}

let pending: Promise<Db> | null = null

/**
 * Lazily start DuckDB-WASM (once), load the spatial extension and create a `lots`
 * view over the remote GeoParquet file. Only the byte ranges a query needs are fetched.
 */
export function getDb(parquetUrl: string): Promise<Db> {
  if (!pending) {
    pending = (async () => {
      const bundle = await duckdb.selectBundle(BUNDLES)
      const worker = new Worker(bundle.mainWorker!)
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
      const conn = await db.connect()
      // Order matters: touching the remote file before loading spatial avoids a
      // DuckDB-WASM error ("stoi: no conversion") on the first HTTP read.
      await conn.query(`CREATE VIEW lots AS SELECT * FROM read_parquet('${parquetUrl}')`)
      await conn.query('INSTALL spatial; LOAD spatial;')
      return { db, conn }
    })().catch((err) => {
      pending = null
      throw err
    })
  }
  return pending
}
