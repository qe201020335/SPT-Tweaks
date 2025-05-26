using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.Models.External;
using SPTarkov.Server.Core.Models.Utils;

namespace SPTTweaks;

[Injectable(InjectionType.Singleton)]
public class Plugin: IPreSptLoadMod, IPostSptLoadMod, IPostDBLoadMod 
{
    private readonly ISptLogger<Plugin> _logger;
    public Plugin(ISptLogger<Plugin> logger)
    {
        _logger = logger;
    }
    
    void IPreSptLoadMod.PreSptLoad()
    {
        _logger.Info("SPTTweaks PreSptLoad");
    }
    
    void IPostSptLoadMod.PostSptLoad()
    {
        _logger.Info("SPTTweaks PostSptLoad");
    }
    
    void IPostDBLoadMod.PostDBLoad()
    {
        _logger.Info("SPTTweaks PostDBLoad");
    }
}