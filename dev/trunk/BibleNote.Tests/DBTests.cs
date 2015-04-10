using System;
using System.Text;
using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Core.DBModel;
using BibleNote.Core.Helpers;
using System.Linq;
using BibleNote.Core.Services.System;

namespace BibleNote.Tests
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
            using (var entities = DBHelper.GetIndexModel())
                foldersCount = entities.DocumentFolder.Count();
            
            using (var entities = DBHelper.GetIndexModel())
            {
                var newFolder = new DocumentFolder();
                newFolder.FolderName = testFolderName;
                entities.DocumentFolder.Add(newFolder);
                entities.SaveChanges();
            }

            using (var entities = DBHelper.GetIndexModel())
            {
                Assert.AreEqual(foldersCount + 1, entities.DocumentFolder.Count());
                var folder = entities.DocumentFolder.FirstOrDefault(f => f.FolderName == testFolderName);
                Assert.IsNotNull(folder);
                entities.DocumentFolder.Remove(folder);
                entities.SaveChanges();
            }

            using (var entities = DBHelper.GetIndexModel())
            {
                Assert.AreEqual(foldersCount, entities.DocumentFolder.Count());                
                Assert.IsNull(entities.DocumentFolder.FirstOrDefault(f => f.FolderName == testFolderName));
            }            
        }

        [TestMethod]
        public void TestContentDBAccessibility()
        {
            var parametersCount = 0;
            var testParameterName = "Test1";
            using (var entities = DBHelper.GetContentModel())
                parametersCount = entities.Parameters.Count();

            using (var entities = DBHelper.GetContentModel())
            {
                var newParameter = new Parameters();
                newParameter.Name = testParameterName;
                newParameter.Value = "testValue";
                entities.Parameters.Add(newParameter);
                entities.SaveChanges();
            }

            using (var entities = DBHelper.GetContentModel())
            {
                Assert.AreEqual(parametersCount + 1, entities.Parameters.Count());
                var parameter = entities.Parameters.FirstOrDefault(f => f.Name == testParameterName);
                Assert.IsNotNull(parameter);
                entities.Parameters.Remove(parameter);
                entities.SaveChanges();
            }

            using (var entities = DBHelper.GetContentModel())
            {
                Assert.AreEqual(parametersCount, entities.Parameters.Count());
                Assert.IsNull(entities.Parameters.FirstOrDefault(f => f.Name == testParameterName));
            }
        }
    }
}
