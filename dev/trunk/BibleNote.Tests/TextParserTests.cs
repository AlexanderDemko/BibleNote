using System;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class TextParserTests
    {
        [TestInitialize]
        public void Init()
        {
            //ConfigurationManager.
        }

        [TestCleanup]
        public void Done()
        {
            
        }        

        [TestMethod]
        public void TestScenario1()
        {
            var input = "тест Лк 1:16, 10:13-17;18-19; 11:1-2 тест";
            var expected = "тест Лк 1:16, 10:13-17; 18-19; 11:1-2 тест";

            //var result = TestHelper.AnalyzeString(input);
            //TestHelper.CheckVerses(expected, result, "Лк 1:16", "Лк 10:13", "Лк 10:14", "Лк 10:15", "Лк 10:16",
            //    "Лк 10:17", "Лк 18", "Лк 19", "Лк 11:1", "Лк 11:2");
        }


        [TestMethod]
        public void TestScenario2()
        {
            var input = "Ин 1:3-2";            

            //var result = TestHelper.AnalyzeString(input);
            //TestHelper.CheckVerses(expected, result, "Лк 1:16", "Лк 10:13", "Лк 10:14", "Лк 10:15", "Лк 10:16",
            //    "Лк 10:17", "Лк 18", "Лк 19", "Лк 11:1", "Лк 11:2");
        }
    }
}
