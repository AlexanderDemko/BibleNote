using System;
using System.IO;
using System.Reflection;
using BibleNote.Common.DiContainer;
using BibleNote.Providers.Html;
using BibleNote.Providers.OneNote;
using BibleNote.Services;
using BibleNote.Services.Configuration.Contracts;
using BibleNote.Services.ModulesManager.Contracts;
using BibleNote.Tests.Mocks;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Tests.TestsBase
{
    public abstract class TestsBase
    {
        private static readonly object TestModulesLock = new object();
        private static readonly string IsolatedDataDirectory = CreateIsolatedDataDirectory();
        private static bool testModulesInitialized;

        static TestsBase()
        {
            Environment.SetEnvironmentVariable("BIBLENOTE_DATA_DIR", IsolatedDataDirectory);
            AppDomain.CurrentDomain.ProcessExit += (_, __) => DeleteIsolatedDataDirectory();
        }

        protected static string TestDataDirectory => IsolatedDataDirectory;

        protected ServiceProvider ServiceProvider { get; set; }
        protected IModulesManager ModulesManager { get; set; }
        protected IConfigurationManager MockConfigurationManager { get; set; }        

        public virtual void Init(Action<IServiceCollection> registerServicesAction = null)
        {
            MockConfigurationManager = new MockConfigurationManager();            

            var services = new ServiceCollection()
               .AddApplicatonServices<ServicesModule>()       
               .AddApplicatonServices<HtmlModule>()
               .AddApplicatonServices<OneNoteModule>()
               //.AddLogging(configure => configure.AddConsole())
               .AddSingleton(sp => MockConfigurationManager);

            registerServicesAction?.Invoke(services);

            ServiceProvider = services
               .AddLogging()
               .BuildServiceProvider();                        

            ModulesManager = ServiceProvider.GetService<IModulesManager>();

            InitializeTestModules();
        }

        private void InitializeTestModules()
        {
            lock (TestModulesLock)
            {
                if (testModulesInitialized)
                    return;

                ModulesManager.UploadModule(ResolveApiFilePath("Modules", "rst", "rst.bnm"), "rst");
                ModulesManager.UploadModule(ResolveApiFilePath("Modules", "kjv", "kjv.bnm"), "kjv");
                testModulesInitialized = true;
            }
        }

        private static string CreateIsolatedDataDirectory()
        {
            var directory = Path.Combine(Path.GetTempPath(), "BibleNote.Tests", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(directory);
            return directory;
        }

        private static void DeleteIsolatedDataDirectory()
        {
            try
            {
                var testRoot = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "BibleNote.Tests"))
                    .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                    + Path.DirectorySeparatorChar;
                var directory = Path.GetFullPath(IsolatedDataDirectory);
                if (directory.StartsWith(testRoot, StringComparison.OrdinalIgnoreCase))
                    Directory.Delete(directory, true);
            }
            catch
            {
                // A failed test process may still hold module files. The unique temp directory
                // is safe to leave for the operating system's normal temp cleanup.
            }
        }

        protected static string ResolveTestDataFilePath(string filePath)
        {
            if (System.IO.File.Exists(filePath))
                return System.IO.Path.GetFullPath(filePath);

            var fullPath = System.IO.Path.GetFullPath(filePath);
            if (System.IO.File.Exists(fullPath))
                return fullPath;

            return ResolveApiFilePath("Tests", "TestData", System.IO.Path.GetFileName(filePath));
        }

        protected static string ResolveApiFilePath(params string[] relativePathSegments)
        {
            foreach (var root in EnumerateSearchRoots())
            {
                var directCandidate = CombinePath(root, relativePathSegments);
                if (System.IO.File.Exists(directCandidate))
                    return directCandidate;

                var apiSegments = new string[relativePathSegments.Length + 1];
                apiSegments[0] = "Api";
                relativePathSegments.CopyTo(apiSegments, 1);
                var apiCandidate = CombinePath(root, apiSegments);
                if (System.IO.File.Exists(apiCandidate))
                    return apiCandidate;
            }

            throw new System.IO.FileNotFoundException(
                $"Could not resolve project file: {System.IO.Path.Combine(relativePathSegments)}",
                System.IO.Path.Combine(relativePathSegments));
        }

        private static System.Collections.Generic.IEnumerable<string> EnumerateSearchRoots()
        {
            foreach (var root in EnumerateAncestorDirectories(AppContext.BaseDirectory))
                yield return root;

            foreach (var root in EnumerateAncestorDirectories(Environment.CurrentDirectory))
                yield return root;
        }

        private static System.Collections.Generic.IEnumerable<string> EnumerateAncestorDirectories(string startPath)
        {
            var directory = new System.IO.DirectoryInfo(startPath);
            if (System.IO.File.Exists(startPath))
                directory = directory.Parent;

            while (directory != null)
            {
                yield return directory.FullName;
                directory = directory.Parent;
            }
        }

        private static string CombinePath(string root, string[] segments)
        {
            var parts = new string[segments.Length + 1];
            parts[0] = root;
            segments.CopyTo(parts, 1);
            return System.IO.Path.Combine(parts);
        }
    }
}
