using JetBrains.Annotations;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.Models.External;
using SPTarkov.Server.Core.Models.Spt.Config;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Servers;
using SPTTweaks.Configuration;

namespace SPTTweaks;

[Injectable(InjectionType.Singleton)]
[UsedImplicitly]
internal class Plugin : IPreSptLoadMod, IPostSptLoadMod, IPostDBLoadMod
{
    private readonly ISptLogger<Plugin> _logger;
    private readonly PluginConfig _config;

    private readonly ConfigServer _configServer;

    public Plugin(ISptLogger<Plugin> logger, ConfigManager configManager, ConfigServer configServer)
    {
        _logger = logger;
        _config = configManager.Config;

        _configServer = configServer;
    }

    void IPreSptLoadMod.PreSptLoad()
    {
        _logger.Debug("SPTTweaks PreSptLoad");

        if (_config.Network.Enable)
        {
            var httpConfig = _configServer.GetConfig<HttpConfig>();
            httpConfig.Ip = _config.Network.ListenIp;
            httpConfig.BackendIp = _config.Network.BackendIp;
            _logger.Info($"[SPTTweaks] Using backend <{httpConfig.BackendIp}> listened on <{httpConfig.Ip}>");
        }
    }

    void IPostSptLoadMod.PostSptLoad()
    {
        _logger.Debug("SPTTweaks PostSptLoad");
    }

    void IPostDBLoadMod.PostDBLoad()
    {
        _logger.Debug("SPTTweaks PostDBLoad");
    }
}