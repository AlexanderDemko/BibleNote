using System;
using System.Text;
using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BibleNote.Core.DBModel;
using BibleNote.Core.Helpers;
using System.Linq;

namespace BibleNote.Tests
{
    /// <summary>
    /// Summary description for DBTests
    /// </summary>
    [TestClass]
    public class DBTests
    {
        public DBTests()
        {
            //
            // TODO: Add constructor logic here
            //
        }

        private TestContext testContextInstance;

        /// <summary>
        ///Gets or sets the test context which provides
        ///information about and functionality for the current test run.
        ///</summary>
        public TestContext TestContext
        {
            get
            {
                return testContextInstance;
            }
            set
            {
                testContextInstance = value;
            }
        }

        #region Additional test attributes
        //
        // You can use the following additional attributes as you write your tests:
        //
        // Use ClassInitialize to run code before running the first test in the class
        // [ClassInitialize()]
        // public static void MyClassInitialize(TestContext testContext) { }
        //
        // Use ClassCleanup to run code after all tests in a class have run
        // [ClassCleanup()]
        // public static void MyClassCleanup() { }
        //
        // Use TestInitialize to run code before running each test 
        // [TestInitialize()]
        // public void MyTestInitialize() { }
        //
        // Use TestCleanup to run code after each test has run
        // [TestCleanup()]
        // public void MyTestCleanup() { }
        //
        #endregion

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
