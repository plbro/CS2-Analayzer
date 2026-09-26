# demoparser2 (WebAssembly build)

The CS2 demo reader, by LaihoE — https://github.com/LaihoE/demoparser (MIT, see LICENSE here).

The WebAssembly copy published on npm (`demoparser2` 0.15 / the one inside `@laihoe/demoparser2` 0.42)
crashes on current CS2 demos, so this folder holds our own build of the latest source.

Built 2026-09-24 from commit `9ddb373` with `wasm-build.patch` applied. The patch:
1. `other_netmessages.rs`: Valve renamed a protobuf field (`customname` → `customnames`).
2. `lib.rs` + 3 files: `std::time::Instant::now()` panics in WebAssembly; a no-op timer is used there instead.

To rebuild (needs Rust, `wasm-pack`, `protoc`):

    git clone https://github.com/LaihoE/demoparser && cd demoparser
    git checkout 9ddb373 && git apply <this folder>/wasm-build.patch
    cd src/wasm && wasm-pack build --release --target web --out-dir <this folder>

Then run `npm run test:demo` to confirm the real demos still read correctly.
