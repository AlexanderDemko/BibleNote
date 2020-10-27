using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Services.ModulesManager.Models.Exceptions;
using BibleNote.Services.ModulesManager.Scheme.Module;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;
using BibleNote.Services.ParallelVerses.Contracts;
using Microsoft.Extensions.Logging;

namespace BibleNote.Services.ModulesManager
{
    class ModulesManager : IModulesManager
    {
        private readonly IBibleParallelTranslationManager _bibleParallelTranslationManager;

        private readonly IConfigurationManager _configurationManager;

        private readonly ILogger<ModulesManager>_log;

        public ModulesManager(
            IBibleParallelTranslationManager bibleParallelTranslationManager, 
            IConfigurationManager configurationManager, 
            ILogger<ModulesManager> log)
        {
            _bibleParallelTranslationManager = bibleParallelTranslationManager;
            _configurationManager = configurationManager;
            _log = log;
        }

        public ModuleInfo GetCurrentModuleInfo()
        {
            if (!string.IsNullOrEmpty(_configurationManager.ModuleShortName))
                return GetModuleInfo(_configurationManager.ModuleShortName);

            throw new ModuleIsUndefinedException();
        }

        public XMLBIBLE GetCurrentBibleContent()
        {
            if (!string.IsNullOrEmpty(_configurationManager.ModuleShortName))
                return GetModuleBibleContent(_configurationManager.ModuleShortName);

            throw new ModuleIsUndefinedException();
        }

        public string GetCurrentModuleDirectiory()
        {
            return GetModuleDirectory(_configurationManager.ModuleShortName);
        }

        public string GetModuleDirectory(string moduleShortName)
        {
            return Path.Combine(GetModulesDirectory(), moduleShortName);
        }

        public ModuleInfo GetModuleInfo(string moduleShortName)
        {   
            return GetModuleFile<ModuleInfo>(moduleShortName, SystemConstants.ManifestFileName);                        
        } 

        public int GetBibleChaptersCount(string moduleShortName, bool addBooksCount)
        {            
            int result;
            try
            {
                var bibleInfo = GetModuleBibleContent(moduleShortName);
                result = GetBibleChaptersCount(bibleInfo, addBooksCount);
            }
            catch (InvalidModuleException)
            {
                result = 1189;  // столько глав в rst
            }

            return result;
        }

        public int GetBibleChaptersCount(XMLBIBLE bibleInfo, bool addBooksCount)
        {
            int result = bibleInfo.Books.Sum(b => b.Chapters.Count);
            if (addBooksCount)
                result += bibleInfo.Books.Count;

            return result;
        }

        public XMLBIBLE GetModuleBibleContent(string moduleShortName)
        {
            return GetModuleFile<XMLBIBLE>(moduleShortName, SystemConstants.BibleContentFileName);
        }

        private string GetModuleFilePath(string moduleShortName, string fileRelativePath)
        {
            string moduleDirectory = GetModuleDirectory(moduleShortName);
            string filePath = Path.Combine(moduleDirectory, fileRelativePath);
            if (!File.Exists(filePath))
                throw new ModuleNotFoundException($"File '{filePath}' not found.");

            return filePath;
        }

        private T GetModuleFile<T>(string moduleShortName, string fileRelativePath)
        {
            var filePath = GetModuleFilePath(moduleShortName, fileRelativePath);

            return Dessirialize<T>(filePath);
        }

        public void UpdateModuleManifest(ModuleInfo moduleInfo)
        {
            var filePath = GetModuleFilePath(moduleInfo.ShortName, SystemConstants.ManifestFileName);

            XmlUtils.SaveToXmlFile(moduleInfo, filePath);
        }

        public string GetModulesDirectory()
        {
            string directoryPath = GetProgramDirectory();

            string modulesDirectory = Path.Combine(directoryPath, SystemConstants.ModulesDirectoryName);

            if (!Directory.Exists(modulesDirectory))
                Directory.CreateDirectory(modulesDirectory);

            return modulesDirectory;
        }

        public string GetModulesPackagesDirectory()
        {
            string directoryPath = GetProgramDirectory();

            string modulesDirectory = Path.Combine(directoryPath, SystemConstants.ModulesPackagesDirectoryName);

            if (!Directory.Exists(modulesDirectory))
                Directory.CreateDirectory(modulesDirectory);

            return modulesDirectory;
        }        

        public List<ModuleInfo> GetModules(bool correctOnly)
        {
            var result = new List<ModuleInfo>();

            foreach (string moduleName in Directory.GetDirectories(GetModulesDirectory(), "*", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    result.Add(GetModuleInfo(Path.GetFileName(moduleName)));
                }
                catch
                {
                    if (!correctOnly)
                        throw;
                }
            }

            return result;
        }

        public bool ModuleIsCorrect(string moduleName, Scheme.Module.ModuleType? moduleType = null)
        {
            try
            {
                CheckModule(moduleName, moduleType);
            }
            catch (InvalidModuleException)
            {
                return false;
            }

            return true;
        }

        public void CheckModule(string moduleDirectoryName, Scheme.Module.ModuleType? moduleType = null)
        {
            ModuleInfo module = GetModuleInfo(moduleDirectoryName);

            CheckModule(module, moduleType);
        }

        public void CheckModule(ModuleInfo module, Scheme.Module.ModuleType? moduleType = null)
        {
            string moduleDirectory = GetModuleDirectory(module.ShortName);

            if (moduleType.HasValue)
                if (module.Type != moduleType.Value)
                    throw new InvalidModuleException(string.Format("Invalid module type: expected '{0}', actual '{1}'", moduleType, module.Type));

            if (module.MinProgramVersion != null)
            {
                var programVersion = GetProgramVersion();
                if (module.MinProgramVersion > programVersion)
                    throw new InvalidModuleException(
                        $"Version of this module is not supported. " +
                        $"You should upgrade the program up to version '{module.MinProgramVersion}'. " +
                        $"The current version of the program is '{programVersion}'.");
            }
        }

        public ModuleInfo UploadModule(string originalFilePath, string moduleName)
        {
            if (Path.GetExtension(originalFilePath).ToLower() != SystemConstants.ModuleFileExtension)
                throw new InvalidModuleException($"Please select a file with extension '{SystemConstants.ModuleFileExtension}'.");

            var destFilePath = Path.Combine(GetModulesPackagesDirectory(), moduleName + SystemConstants.ModuleFileExtension);
            destFilePath = CopyModulePackage(originalFilePath, destFilePath);

            string destFolder = GetModuleDirectory(moduleName);
            if (Directory.Exists(destFolder))
                Directory.Delete(destFolder, true);

            Directory.CreateDirectory(destFolder);

            try
            {
                ZipLibHelper.ExtractZipFile(File.ReadAllBytes(destFilePath), destFolder);
                var module = GetModuleInfo(moduleName);
                CheckModule(module);

                if (module.Type == Scheme.Module.ModuleType.Bible || module.Type == Scheme.Module.ModuleType.Strong)
                {
                    var baseModule = GetModuleInfo(_configurationManager.ModuleShortName);

                    if (_bibleParallelTranslationManager.MergeModuleWithMainBible(baseModule, module))
                        UpdateModuleManifest(baseModule);
                    else
                        _bibleParallelTranslationManager.MergeAllModulesWithMainBible(baseModule, 
                                GetModules(true).Where(m => m.ShortName != _configurationManager.ModuleShortName));
                }

                return module;
            }
            catch (Exception ex)
            {
                throw new InvalidModuleException(ex.Message);
            }
        }

        public ModuleInfo ReadModuleInfo(string moduleFilePath)
        {            
            string destFolder = Path.Combine(GetTempFolderPath(), Path.GetFileNameWithoutExtension(moduleFilePath));
            try
            {
                if (Directory.Exists(destFolder))
                    Directory.Delete(destFolder, true);

                Directory.CreateDirectory(destFolder);

                ZipLibHelper.ExtractZipFile(File.ReadAllBytes(moduleFilePath), destFolder, new string[] { SystemConstants.ManifestFileName });

                string manifestFilePath = Path.Combine(destFolder, SystemConstants.ManifestFileName);
                if (!File.Exists(manifestFilePath))
                    throw new InvalidModuleException($"File '{manifestFilePath}' not found.");

                return Dessirialize<ModuleInfo>(manifestFilePath);                                
            }
            finally
            {
                ThreadPool.QueueUserWorkItem(DeleteDirectory, destFolder);
            }
        }

        public void DeleteModule(string moduleShortName)
        {
            string moduleDirectory = GetModuleDirectory(moduleShortName);
            if (Directory.Exists(moduleDirectory))
                Directory.Delete(moduleDirectory, true);

            string manifestFilePath = Path.Combine(GetModulesPackagesDirectory(), moduleShortName + SystemConstants.ModuleFileExtension);
            if (File.Exists(manifestFilePath))
            {
                try
                {
                    File.Delete(manifestFilePath);
                }
                catch (UnauthorizedAccessException ex)
                {
                    _log.LogError(ex.ToString());
                }
            }

            var baseModule =  GetModuleInfo(_configurationManager.ModuleShortName);
            _bibleParallelTranslationManager.RemoveBookAbbreviationsFromMainBible(baseModule, moduleShortName, false);
            UpdateModuleManifest(baseModule);

            _bibleParallelTranslationManager.MergeAllModulesWithMainBible(baseModule,
                    GetModules(true).Where(m => m.ShortName != _configurationManager.ModuleShortName));   // например, у меня основной модуль KJV. Я добавил RST, а потом - UBIO. Когда я удалю RST - надо добавить в основной модуль сокращения из UBIO (ведь раньше они не были добавлены, так как они повторялись с RST)
        }

        public void SetCurrentModule(string moduleShortName)
        {
            _configurationManager.ModuleShortName = moduleShortName;
            _configurationManager.SaveChanges();
        }

        private static string GetTempFolderPath()
        {
            string s = Path.Combine(GetProgramDirectory(), SystemConstants.TempDirectoryName);
            if (!Directory.Exists(s))
                Directory.CreateDirectory(s);

            return s;
        }

        private static string GetProgramDirectory()
        {
            string directoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), SystemConstants.ToolsName);

            if (!Directory.Exists(directoryPath))
                Directory.CreateDirectory(directoryPath);

            return directoryPath;
        }

        private static Version GetProgramVersion()
        {
            var assembly = Assembly.GetExecutingAssembly();
            return assembly.GetName().Version;
        }

        private void DeleteDirectory(object directoryPath)
        {
            Thread.Sleep(500);
            try
            {
                if (Directory.Exists((string)directoryPath))
                    Directory.Delete((string)directoryPath, true);
            }
            catch (Exception ex)
            {
                _log.LogError(ex.ToString());
            }
        }

        private static T Dessirialize<T>(string xmlFilePath)
        {
            try
            {
                return XmlUtils.LoadFromXmlFile<T>(xmlFilePath);
            }
            catch (Exception ex)
            {
                throw new InvalidModuleException(ex.Message);
            }
        }

        private string CopyModulePackage(string originalFilePath, string destFilePath)
        {
            try
            {
                File.Copy(originalFilePath, destFilePath, true);
                return destFilePath;
            }
            catch (Exception ex)
            {
                _log.LogError(ex.ToString());

                if (ex is IOException
                    || ex is UnauthorizedAccessException)
                {
                    for (var i = 1; i <= 20; i++)
                    {
                        var tempDestFilePath = Path.Combine(Path.GetDirectoryName(destFilePath), string.Concat(Path.GetFileNameWithoutExtension(destFilePath), i, Path.GetExtension(destFilePath)));
                        if (!File.Exists(tempDestFilePath))
                        {
                            destFilePath = tempDestFilePath;
                            File.Copy(originalFilePath, destFilePath, true);

                            return destFilePath;
                        }
                    }
                }

                throw;
            }
        }
    }    
}
