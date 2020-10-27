﻿using BibleNote.Services.Configuration.Contracts;

namespace BibleNote.Tests.Mocks
{
    public class MockConfigurationManager : IConfigurationManager
    {
        public string ModuleShortName { get; set; }

        public bool UseCommaDelimiter { get; set; }

        public MockConfigurationManager()
        {           
            ModuleShortName = "rst";
            UseCommaDelimiter = true;          
        }

        public void SaveChanges()
        {
        }
    }
}
