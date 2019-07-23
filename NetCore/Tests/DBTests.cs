using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Linq;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class DBTests
    {
        private AnalyticsContext _analyticsContext;

        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();

            Database.SetInitializer(new MigrateDatabaseToLatestVersion<AnalyticsContext, Configuration>());
            _analyticsContext = DIContainer.Resolve<AnalyticsContext>();            
        }

        [TestMethod]
        [TestCategory("IgnoreOnCI")]
        public void TestCreateAndDeleteFolder()
        {
            var foldersCount = 0;
            var testFolderName = "Test1";            

            foldersCount = _analyticsContext.DocumentFolders.Count();

            var newFolder = new DocumentFolder() { Name = testFolderName, NavigationProviderName = "Html", Path = "c:\temp" };            
            _analyticsContext.DocumentFolders.Add(newFolder);
            _analyticsContext.SaveChanges();

            Assert.AreEqual(foldersCount + 1, _analyticsContext.DocumentFolders.Count());
            var folder = _analyticsContext.DocumentFolders.FirstOrDefault(f => f.Name == testFolderName);
            Assert.IsNotNull(folder);
            _analyticsContext.DocumentFolders.Remove(folder);
            _analyticsContext.SaveChanges();

            Assert.AreEqual(foldersCount, _analyticsContext.DocumentFolders.Count());
            Assert.IsNull(_analyticsContext.DocumentFolders.FirstOrDefault(f => f.Name == testFolderName));            
        }
    }
}
