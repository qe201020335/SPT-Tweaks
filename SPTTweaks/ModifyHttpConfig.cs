using System.Threading.Tasks;
using JetBrains.Annotations;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.Models.External;
using SPTarkov.Server.Core.Models.Spt.Config;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Servers;
using SPTTweaks.Configuration;

namespace SPTTweaks;

[Injectable]
[UsedImplicitly]
internal class ModifyHttpConfig : IOnWebAppBuildModAsync
{
    private readonly ISptLogger<ModifyHttpConfig> _logger;
    private readonly PluginConfig _config;
    private readonly HttpConfig _httpConfig;

    public ModifyHttpConfig(ISptLogger<ModifyHttpConfig> logger, ConfigManager configManager, ConfigServer configServer)
    {
        _logger = logger;
        _config = configManager.Config;
        _httpConfig = configServer.GetConfig<HttpConfig>();
    }

    public Task OnWebAppBuildAsync()
    {
        _logger.Info("SPTTweaks OnWebAppBuildAsync");

        if (_config.Network.Enable)
        {
            _httpConfig.Ip = _config.Network.ListenIp;
            _httpConfig.BackendIp = _config.Network.BackendIp;
            _logger.Info($"[SPTTweaks] Using backend <{_httpConfig.BackendIp}> listened on <{_httpConfig.Ip}>");
        }

        return Task.CompletedTask;
    }
}