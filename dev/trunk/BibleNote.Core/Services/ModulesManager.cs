using BibleCommon.Scheme;
using BibleNote.Core.Cache;
using BibleNote.Core.Common;
using BibleNote.Core.Constants;
using BibleNote.Core.Helpers;
using BibleNote.Core.Resources;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services
{
    public class ModulesManager
    {
        public ModuleInfo GetCurrentModuleInfo()
        {
            if (!string.IsNullOrEmpty(ConfigurationManager.Instance.ModuleShortName))
                return GetModuleInfo(ConfigurationManager.Instance.ModuleShortName);

            throw new ModuleIsUndefinedException("Current Module is undefined.");
        }

        public static XMLBIBLE GetCurrentBibleContent()
        {
            if (!string.IsNullOrEmpty(ConfigurationManager.Instance.ModuleShortName))
                return GetModuleBibleInfo(ConfigurationManager.Instance.ModuleShortName);

            throw new ModuleIsUndefinedException("Current Module is undefined.");
        }

        public static string GetCurrentModuleDirectiory()
        {
            return GetModuleDirectory(ConfigurationManager.Instance.ModuleShortName);
        }

        public static string GetModuleDirectory(string moduleShortName)
        {
            return Path.Combine(GetModulesDirectory(), moduleShortName);
        }

        public static ModuleInfo GetModuleInfo(string moduleShortName)
        {   
            return GetModuleFile<ModuleInfo>(moduleShortName, SystemConstants.ManifestFileName);            
            
        }

        public static int? GetChapterVersesCount(XMLBIBLE bibleIndo, SimpleVersePointer chapterVersePointer)
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

        public static int GetBibleChaptersCount(string moduleShortName, bool addBooksCount)
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

        public static int GetBibleChaptersCount(XMLBIBLE bibleInfo, bool addBooksCount)
        {
            int result = bibleInfo.Books.Sum(b => b.Chapters.Count);
            if (addBooksCount)
                result += bibleInfo.Books.Count;

            return result;
        }

        public static XMLBIBLE GetModuleBibleInfo(string moduleShortName)
        {
            return GetModuleFile<XMLBIBLE>(moduleShortName, SystemConstants.BibleContentFileName);
        }

        private static string GetModuleFilePath(string moduleShortName, string fileRelativePath)
        {
            string moduleDirectory = GetModuleDirectory(moduleShortName);
            string filePath = Path.Combine(moduleDirectory, fileRelativePath);
            if (!File.Exists(filePath))
                throw new ModuleNotFoundException(string.Format(LocalizationConstants.FileNotFound, filePath));

            return filePath;
        }

        private static T GetModuleFile<T>(string moduleShortName, string fileRelativePath)
        {
            var filePath = GetModuleFilePath(moduleShortName, fileRelativePath);

            return Dessirialize<T>(filePath);
        }

        public static void UpdateModuleManifest(ModuleInfo moduleInfo)
        {
            var filePath = GetModuleFilePath(moduleInfo.ShortName, SystemConstants.ManifestFileName);

            XmlUtils.SaveToXmlFile(moduleInfo, filePath);
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

        public static string GetModulesDirectory()
        {
            string directoryPath = SystemUtils.GetProgramDirectory();

            string modulesDirectory = Path.Combine(directoryPath, SystemConstants.ModulesDirectoryName);

            if (!Directory.Exists(modulesDirectory))
                Directory.CreateDirectory(modulesDirectory);

            return modulesDirectory;
        }

        public static string GetModulesPackagesDirectory()
        {
            string directoryPath = SystemUtils.GetProgramDirectory();

            string modulesDirectory = Path.Combine(directoryPath, SystemConstants.ModulesPackagesDirectoryName);

            if (!Directory.Exists(modulesDirectory))
                Directory.CreateDirectory(modulesDirectory);

            return modulesDirectory;
        }

        public static List<ModuleInfo> GetModules(bool correctOnly)
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

        public static bool ModuleIsCorrect(string moduleName, Common.ModuleType? moduleType = null)
        {
            try
            {
                ModulesManager.CheckModule(moduleName, moduleType);
            }
            catch (InvalidModuleException)
            {              
                return false;
            }

            return true;
        }

        public static void CheckModule(string moduleDirectoryName, Common.ModuleType? moduleType = null)
        {
            ModuleInfo module = GetModuleInfo(moduleDirectoryName);
            
            CheckModule(module, moduleType);
        }

        public static void CheckModule(ModuleInfo module, Common.ModuleType? moduleType = null)
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

        public static ModuleInfo UploadModule(string originalFilePath, string destFilePath, string moduleName)
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
                    if (!BibleParallelTranslationManager.MergeModuleWithMainBible(module))
                        BibleParallelTranslationManager.MergeAllModulesWithMainBible();
                }

                return module;
            }
            catch (Exception ex)
            {
                throw new InvalidModuleException(ex.Message);
            }
        }

        private static string CopyModulePackage(string originalFilePath, string destFilePath)
        {
            try
            {
                File.Copy(originalFilePath, destFilePath, true);
                return destFilePath;
            }
            catch (Exception ex)
            {
                Logger.LogError(ex);

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

        public static ModuleInfo ReadModuleInfo(string moduleFilePath)
        {            
            string destFolder = Path.Combine(Utils.GetTempFolderPath(), Path.GetFileNameWithoutExtension(moduleFilePath));
            try
            {
                if (Directory.Exists(destFolder))
                    Directory.Delete(destFolder, true);

                Directory.CreateDirectory(destFolder);

                ZipLibHelper.ExtractZipFile(File.ReadAllBytes(moduleFilePath), destFolder, new string[] { Constants.ManifestFileName });

                string manifestFilePath = Path.Combine(destFolder, Constants.ManifestFileName);
                if (!File.Exists(manifestFilePath))
                    throw new InvalidModuleException(string.Format(BibleCommon.Resources.Constants.FileNotFound, manifestFilePath));

                var module = Dessirialize<ModuleInfo>(manifestFilePath);
                if (string.IsNullOrEmpty(module.ShortName))
                    module.ShortName = Path.GetFileNameWithoutExtension(moduleFilePath);
                module.CorrectModuleAfterDeserialization();

                return module;
            }
            finally
            {
                new Thread(DeleteDirectory).Start(destFolder);
            }
        }


        private static void DeleteDirectory(object directoryPath)
        {
            Thread.Sleep(500);
            try
            {
                if (Directory.Exists((string)directoryPath))
                    Directory.Delete((string)directoryPath, true);
            }
            catch { }                
        }

        public static void DeleteModule(string moduleShortName)
        {
            string moduleDirectory = GetModuleDirectory(moduleShortName);
            if (Directory.Exists(moduleDirectory))
                Directory.Delete(moduleDirectory, true);

            string manifestFilePath = Path.Combine(GetModulesPackagesDirectory(), moduleShortName + Constants.FileExtensionIsbt);
            if (File.Exists(manifestFilePath))
            {
                try
                {
                    File.Delete(manifestFilePath);
                }
                catch (UnauthorizedAccessException ex)
                {
                    Logger.LogError(ex);
                }
            }

            BibleParallelTranslationManager.RemoveBookAbbreviationsFromMainBible(moduleShortName, false);
            BibleParallelTranslationManager.MergeAllModulesWithMainBible();   // например, у меня основной модуль KJV. Я добавил RST, а потом - UBIO. Когда я удалю RST - надо добавить в основной модуль сокращения из UBIO (ведь раньше они не были добавлены, так как они повторялись с RST)
        }        
    }    
}
