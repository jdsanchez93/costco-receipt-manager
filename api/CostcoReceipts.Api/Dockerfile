# Framework-dependent publish (no -r/self-contained/ReadyToRun), so only
# the target platform matters, not the specific SoC. Build this on an
# Apple Silicon Mac with a plain `docker build` — its Docker Desktop VM
# runs arm64 natively, so the image comes out as linux/arm64 with no
# --platform flag and no QEMU emulation, which is exactly what the Pi
# needs (both are ARMv8-A/aarch64). Ship it over with
# `docker save <tag> | gzip > image.tar.gz`, scp, `docker load`.
# Building directly on the Pi also works (same command, just slower) —
# on an Intel Mac you'd need `--platform linux/arm64` and QEMU instead.
#
# Build context is the `api/` directory (see docker-compose.prod.yml).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY CostcoReceipts.Api/CostcoReceipts.Api.csproj CostcoReceipts.Api/
RUN dotnet restore CostcoReceipts.Api/CostcoReceipts.Api.csproj
COPY CostcoReceipts.Api/ CostcoReceipts.Api/
RUN dotnet publish CostcoReceipts.Api/CostcoReceipts.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "CostcoReceipts.Api.dll"]
