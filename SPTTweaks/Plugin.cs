using System.Threading.Tasks;
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
internal class Plugin : IPreSptLoadModAsync, IPostSptLoadModAsync, IPostDBLoadModAsync
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

    async Task IPreSptLoadModAsync.PreSptLoadAsync()
    {
        _logger.Info("SPTTweaks PreSptLoad");

        if (_config.Network.Enable)
        {
            var httpConfig = _configServer.GetConfig<HttpConfig>();
            httpConfig.Ip = _config.Network.ListenIp;
            httpConfig.BackendIp = _config.Network.BackendIp;
            _logger.Info($"[SPTTweaks] Using backend <{httpConfig.BackendIp}> listened on <{httpConfig.Ip}>");
        }
    }

    async Task IPostSptLoadModAsync.PostSptLoadAsync()
    {
        _logger.Info("SPTTweaks PostSptLoad");
    }

    async Task IPostDBLoadModAsync.PostDBLoadAsync()
    {
        _logger.Info("SPTTweaks PostDBLoad");
    }
}