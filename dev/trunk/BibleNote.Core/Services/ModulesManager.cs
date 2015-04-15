using BibleCommon.Scheme;
using BibleNote.Core.Cache;
using BibleNote.Core.Common;
using BibleNote.Core.Constants;
using BibleNote.Core.Contracts;
using BibleNote.Core.Helpers;
using BibleNote.Core.Resources;
using BibleNote.Core.Services.System;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Core.Services
{
    public class ModulesManager : IModulesManager
    {
        [Dependency]
        public ILogger Logger { get; set; }

        [Dependency]
        public IConfigurationManager ConfigurationManager { get; set; }

        [Dependency]
        public IBibleParallelTranslationManager BibleParallelTranslationManager { get; set; }

        public ModuleInfo GetCurrentModuleInfo()
        {
            if (!string.IsNullOrEmpty(ConfigurationManager.ModuleShortName))
                return GetModuleInfo(ConfigurationManager.ModuleShortName);

            throw new ModuleIsUndefinedException("Current Module is undefined.");
        }

        public XMLBIBLE GetCurrentBibleContent()
        {
            if (!string.IsNullOrEmpty(ConfigurationManager.ModuleShortName))
                return GetModuleBibleInfo(ConfigurationManager.ModuleShortName);

            throw new ModuleIsUndefinedException("Current Module is undefined.");
        }

        public string GetCurrentModuleDirectiory()
        {
            return GetModuleDirectory(ConfigurationManager.ModuleShortName);
        }

        public string GetModuleDirectory(string moduleShortName)
        {
            return Path.Combine(GetModulesDirectory(), moduleShortName);
        }

        public ModuleInfo GetModuleInfo(string moduleShortName)
        {   
            return GetModuleFile<ModuleInfo>(moduleShortName, SystemConstants.ManifestFileName);            
            
        }

        public int? GetChapterVersesCount(XMLBIBLE bibleIndo, SimpleVersePointer chapterVersePointer)
        {
            var bookInfo = bibleIndo.Books.FirstOrDefault(b => b.Index == chapterVersePointer.BookIndex);
            if (bookInfo != null)
            {
                var chapterInfo = bookInfo.Chapters.FirstOrDefault(c => c.Index == chapterVersePointer.Chapter);
                if (chapterInfo != null)
                    return chapterInfo.Verses.Count;
            }

            return null;
        }

        public int GetBibleChaptersCount(string moduleShortName, bool addBooksCount)
        {            
            int result;
            try
            {
                var bibleInfo = GetModuleBibleInfo(moduleShortName);
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

        public XMLBIBLE GetModuleBibleInfo(string moduleShortName)
        {
            return GetModuleFile<XMLBIBLE>(moduleShortName, SystemConstants.BibleContentFileName);
        }

        private string GetModuleFilePath(string moduleShortName, string fileRelativePath)
        {
            string moduleDirectory = GetModuleDirectory(moduleShortName);
            string filePath = Path.Combine(moduleDirectory, fileRelativePath);
            if (!File.Exists(filePath))
                throw new ModuleNotFoundException(string.Format(LocalizationConstants.FileNotFound, filePath));

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
            string directoryPath = SystemUtils.GetProgramDirectory();

            string modulesDirectory = Path.Combine(directoryPath, SystemConstants.ModulesDirectoryName);

            if (!Directory.Exists(modulesDirectory))
                Directory.CreateDirectory(modulesDirectory);

            return modulesDirectory;
        }

        public string GetModulesPackagesDirectory()
        {
            string directoryPath = SystemUtils.GetProgramDirectory();

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

        public bool ModuleIsCorrect(string moduleName, Common.ModuleType? moduleType = null)
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

        public void CheckModule(string moduleDirectoryName, Common.ModuleType? moduleType = null)
        {
            ModuleInfo module = GetModuleInfo(moduleDirectoryName);

            CheckModule(module, moduleType);
        }

        public void CheckModule(ModuleInfo module, Common.ModuleType? moduleType = null)
        {
            string moduleDirectory = GetModuleDirectory(module.ShortName);

            if (moduleType.HasValue)
                if (module.Type != moduleType.Value)
                    throw new InvalidModuleException(string.Format("Invalid module type: expected '{0}', actual '{1}'", moduleType, module.Type));

            if (module.MinProgramVersion != null)
            {
                var programVersion = SystemUtils.GetProgramVersion();
                if (module.MinProgramVersion > programVersion)
                    throw new InvalidModuleException(string.Format(LocalizationConstants.ModuleIsNotSupported, module.MinProgramVersion, programVersion));
            }
        }

        public ModuleInfo UploadModule(string originalFilePath, string destFilePath, string moduleName)
        {
            if (Path.GetExtension(originalFilePath).ToLower() != SystemConstants.ModuleFileExtension)
                throw new InvalidModuleException(string.Format(LocalizationConstants.SelectFileWithExtension, SystemConstants.ModuleFileExtension));

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

                if (module.Type == Common.ModuleType.Bible || module.Type == Common.ModuleType.Strong)
                {
                    var baseModule = GetModuleInfo(ConfigurationManager.ModuleShortName);

                    if (BibleParallelTranslationManager.MergeModuleWithMainBible(baseModule, module))
                        UpdateModuleManifest(baseModule);
                    else
                        BibleParallelTranslationManager.MergeAllModulesWithMainBible(baseModule, 
                                GetModules(true).Where(m => m.ShortName != ConfigurationManager.ModuleShortName));
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
            string destFolder = Path.Combine(SystemUtils.GetTempFolderPath(), Path.GetFileNameWithoutExtension(moduleFilePath));
            try
            {
                if (Directory.Exists(destFolder))
                    Directory.Delete(destFolder, true);

                Directory.CreateDirectory(destFolder);

                ZipLibHelper.ExtractZipFile(File.ReadAllBytes(moduleFilePath), destFolder, new string[] { SystemConstants.ManifestFileName });

                string manifestFilePath = Path.Combine(destFolder, SystemConstants.ManifestFileName);
                if (!File.Exists(manifestFilePath))
                    throw new InvalidModuleException(string.Format(LocalizationConstants.FileNotFound, manifestFilePath));

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
                    Logger.LogException(ex);
                }
            }

            var baseModule =  GetModuleInfo(ConfigurationManager.ModuleShortName);
            BibleParallelTranslationManager.RemoveBookAbbreviationsFromMainBible(baseModule, moduleShortName, false);
            UpdateModuleManifest(baseModule);

            BibleParallelTranslationManager.MergeAllModulesWithMainBible(baseModule,
                    GetModules(true).Where(m => m.ShortName != ConfigurationManager.ModuleShortName));   // например, у меня основной модуль KJV. Я добавил RST, а потом - UBIO. Когда я удалю RST - надо добавить в основной модуль сокращения из UBIO (ведь раньше они не были добавлены, так как они повторялись с RST)
        } 


        private void DeleteDirectory(object directoryPath)
        {
            Thread.Sleep(500);
            try
            {
                if (Directory.Exists((string)directoryPath))
                    Directory.Delete((string)directoryPath, true);
            }
            catch (Exception ex) { Logger.LogException(ex); }                
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
                Logger.LogException(ex);

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
