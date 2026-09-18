# Windows .exe'yi Linux uzerinde uretir. Windows tarafina hicbir sey kurulmaz.
#
# Neden cargo-xwin degil de xwin CLI + duz cargo?
# cargo-xwin, Windows SDK'sini indirirken mimariyi daraltmaya izin vermiyor ve
# varsayilan olarak arm64/x86/Store varyantlarini da aciyor. Bu, ilk kurulumu
# saatlerce suren bir ise cevirdi. xwin'i dogrudan cagirinca
# "--arch x86_64 --variant desktop" diyebiliyoruz; ihtiyacimiz olan tek sey bu.
#
# Onemli: xwin onbellek ve cikti dizini AYNI dosya sisteminde olmali. xwin
# dosyalari kopyalamiyor, rename ile tasiyor; ayri Docker hacimlerine
# koyulursa "Cross-device link (os error 18)" ile patliyor. Bu yuzden ikisi de
# tek bir /xwin hacminin altinda.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    CARGO_HOME=/usr/local/cargo \
    RUSTUP_HOME=/usr/local/rustup \
    PATH=/usr/local/cargo/bin:$PATH \
    XWIN_CACHE=/xwin/cache \
    XWIN_SDK=/xwin/sdk

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl ca-certificates git pkg-config \
      clang lld llvm tar xz-utils \
      nsis \
    && rm -rf /var/lib/apt/lists/*

# --- Node.js 22 LTS (arayuzu Vite ile derlemek icin) ---
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && npm --version

# --- Rust + Windows MSVC hedefi ---
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
      | sh -s -- -y --default-toolchain stable --profile minimal \
        --target x86_64-pc-windows-msvc \
    && rustc --version

# --- Tauri CLI + xwin (hazir ikili indirir, imaj yapimi hizlansin) ---
RUN curl -fsSL https://github.com/cargo-bins/cargo-binstall/releases/latest/download/cargo-binstall-x86_64-unknown-linux-musl.tgz \
      | tar -xz -C /usr/local/cargo/bin \
    && cargo binstall -y tauri-cli@^2.11 xwin \
    && cargo tauri --version && xwin --version

# Debian'in clang paketi "clang-cl" adini kurmuyor; clang bu adla cagrildiginda
# MSVC uyumlu moda geciyor, o yuzden sembolik bag yetiyor. (lld-link ve llvm-lib
# zaten dogru adlarla geliyor.) Bu adim en sonda: ust katmanlari bozmasin.
RUN CLANG="$(readlink -f "$(command -v clang)")"     && ln -sf "$CLANG" /usr/bin/clang-cl     && clang-cl --version | head -1     && lld-link --version | head -1

# Tauri CLI, tepsi ikonu (tray-icon) acikken paketleme adiminda host'ta
# appindicator kutuphanesini ariyor - hedef Windows olsa bile. Bulamayinca
# "Can't detect any appindicator library" diye duruyor. Yalnizca bu kontrolu
# gecmek icin kuruluyor, ciktiya girmiyor.
#
# Katman en sonda: ustteki agir katmanlar (Node, Rust, cargo-binstall)
# onbellekte kalsin.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libayatana-appindicator3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
