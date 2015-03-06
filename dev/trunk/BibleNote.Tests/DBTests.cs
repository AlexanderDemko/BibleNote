using System;
using System.Text;
using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Core.DBModel;
using BibleNote.Core.Helpers;
using System.Linq;

namespace BibleNote.Tests
{ 
    [TestClass]
    public class DBTests
    {
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
    }
}
