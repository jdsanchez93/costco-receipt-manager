# Built by .github/workflows/api.yml on a GitHub-hosted arm64 runner and
# pushed to GHCR, where it is public; api/deploy/costco-deploy.sh then deploys
# it to the Pi by digest. Nothing ships an image from a dev machine any more.
#
# Framework-dependent publish (no -r/self-contained/ReadyToRun), so only the
# target platform matters, not the specific SoC: anything linux/arm64 runs on
# the Pi. A plain `docker build` on an Apple Silicon Mac produces that
# natively too, which is still the way to try an image locally.
#
# Build context is the `api/` directory.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY CostcoReceipts.Api/CostcoReceipts.Api.csproj CostcoReceipts.Api/
RUN dotnet restore CostcoReceipts.Api/CostcoReceipts.Api.csproj
COPY CostcoReceipts.Api/ CostcoReceipts.Api/
RUN dotnet publish CostcoReceipts.Api/CostcoReceipts.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
# The non-root user the .NET images ship. The container shares the Pi's
# network namespace, so root inside it is worth avoiding, and Kestrel's 8080
# needs no privilege.
USER $APP_UID
ENTRYPOINT ["dotnet", "CostcoReceipts.Api.dll"]
