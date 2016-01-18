using System;
using System.Text;
using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Analytics.Core.Helpers;
using System.Linq;
using BibleNote.Analytics.Services.Unity;
using BibleNote.Analytics.Data;
using BibleNote.Analytics.Models.Entities;

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
        public void TestCreateAndDeleteFolder()
        {
            var foldersCount = 0;
            var testFolderName = "Test1";
            using (var entities = new AnalyticsContext())
                foldersCount = entities.DocumentFolders.Count();

            using (var entities = new AnalyticsContext())
            {
                var newFolder = new DocumentFolder();
                newFolder.Name = testFolderName;
                entities.DocumentFolders.Add(newFolder);
                entities.SaveChanges();
            }

            using (var entities = new AnalyticsContext())
            {
                Assert.AreEqual(foldersCount + 1, entities.DocumentFolders.Count());
                var folder = entities.DocumentFolders.FirstOrDefault(f => f.Name == testFolderName);
                Assert.IsNotNull(folder);
                entities.DocumentFolders.Remove(folder);
                entities.SaveChanges();
            }

            using (var entities = new AnalyticsContext())
            {
                Assert.AreEqual(foldersCount, entities.DocumentFolders.Count());                
                Assert.IsNull(entities.DocumentFolders.FirstOrDefault(f => f.Name == testFolderName));
            }            
        }     
    }
}
