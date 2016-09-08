using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Linq;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Data;
using BibleNote.Analytics.Data.Entities;

namespace BibleNote.Tests.Analytics
{ 
    [TestClass]
    public class DBTests
    {
        [TestInitialize]
        public void Init()
        {
            DIContainer.InitWithDefaults();
        }

        [TestMethod]
        [TestCategory("IgnoreOnCI")]
        public void TestCreateAndDeleteFolder()
        {
            var foldersCount = 0;
            var testFolderName = "Test1";

            var analyticsContext = DIContainer.Resolve<AnalyticsContext>();

            foldersCount = analyticsContext.DocumentFolders.Count();

            var newFolder = new DocumentFolder();
            newFolder.Name = testFolderName;
            analyticsContext.DocumentFolders.Add(newFolder);
            analyticsContext.SaveChanges();

            Assert.AreEqual(foldersCount + 1, analyticsContext.DocumentFolders.Count());
            var folder = analyticsContext.DocumentFolders.FirstOrDefault(f => f.Name == testFolderName);
            Assert.IsNotNull(folder);
            analyticsContext.DocumentFolders.Remove(folder);
            analyticsContext.SaveChanges();

            Assert.AreEqual(foldersCount, analyticsContext.DocumentFolders.Count());
            Assert.IsNull(analyticsContext.DocumentFolders.FirstOrDefault(f => f.Name == testFolderName));            
        }
    }
}
