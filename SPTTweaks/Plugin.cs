using System.Threading.Tasks;
using JetBrains.Annotations;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.Models.External;
using SPTarkov.Server.Core.Models.Utils;

namespace SPTTweaks;

[Injectable(InjectionType.Singleton)]
[UsedImplicitly]
internal class Plugin : IPreSptLoadModAsync, IPostSptLoadModAsync, IPostDBLoadModAsync
{
    private readonly ISptLogger<Plugin> _logger;

    public Plugin(ISptLogger<Plugin> logger)
    {
        _logger = logger;
    }

    async Task IPreSptLoadModAsync.PreSptLoadAsync()
    {
        _logger.Info("SPTTweaks PreSptLoad");
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