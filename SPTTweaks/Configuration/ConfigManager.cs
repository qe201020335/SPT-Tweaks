using System;
using System.IO;
using System.Reflection;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.Utils;

namespace SPTTweaks.Configuration;

[Injectable(InjectionType.Singleton)]
internal class ConfigManager
{
    private readonly ILogger _logger;
    private readonly JsonUtil _jsonUtil;
    private readonly FileUtil _fileUtil;

    private PluginConfig? _pluginConfig;

    public PluginConfig Config
    {
        get
        {
            _pluginConfig ??= LoadConfig();
            return _pluginConfig;
        }
    }

    public ConfigManager(ILogger<ConfigManager> logger, JsonUtil jsonUtil, FileUtil fileUtil)
    {
        _logger = logger;
        _jsonUtil = jsonUtil;
        _fileUtil = fileUtil;
    }

    private PluginConfig LoadConfig()
    {
        _logger.LogInformation("[SPTTweaks] Loading config");
        string configPath;

        try
        {
            var pluginPath = Assembly.GetExecutingAssembly().Location;
            configPath = Path.Combine(Path.GetDirectoryName(pluginPath)!, "config", "config.json");
        }
        catch (NotSupportedException e)
        {
            _logger.LogWarning(e, "Failed to get plugin path, not loading config from file");
            _logger.LogInformation("Is this a dynamic assembly???");
            return new PluginConfig();
        }

        PluginConfig config;

        if (File.Exists(configPath))
        {
            try
            {
                var instance = _jsonUtil.DeserializeFromFile<PluginConfig>(configPath);
                if (instance == null)
                {
                    _logger.LogWarning("Failed to load config from file: {ConfigPath}", configPath);
                    instance = new PluginConfig();
                }

                config = instance;
            }
            catch (JsonException e)
            {
                _logger.LogError(e, "Failed to deserialize config from file: {ConfigPath}", configPath);
                _logger.LogWarning("Config file may be malformed");
                config = new PluginConfig();
            }

            // backup existing file
            _fileUtil.CopyFile(configPath, configPath + ".bak.json", true);
        }
        else
        {
            _logger.LogDebug("Config file not found, creating default config");
            config = new PluginConfig();
        }

        // save config to file
        _fileUtil.WriteFile(configPath, _jsonUtil.Serialize(config, true)!);
        return config;
    }
}