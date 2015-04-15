﻿using BibleNote.Analytics.Contracts;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services
{
    public class ConfigurationManager : IConfigurationManager
    {
        public string DBIndexPath { get; set; }
        public string DBContentPath { get; set; }
        public string ModuleShortName { get; set; }
        public bool UseCommaDelimiter { get; set; }
        

        public ConfigurationManager(bool loadTestData)
        {
            if (loadTestData)
            {
                DBIndexPath = @"C:\prj\BibleNote v4\dev\trunk\Data\BibleNote.Index.sdf";
                DBContentPath = @"C:\prj\BibleNote v4\dev\trunk\Data\BibleNote.Content.sdf";
                ModuleShortName = "rst";
                UseCommaDelimiter = true;
            }
            else
                throw new NotImplementedException();
        }        
    }
}