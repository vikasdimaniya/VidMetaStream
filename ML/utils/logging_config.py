"""
Logging configuration for the ML package
"""
import os
import logging
from datetime import datetime

class CustomFormatter(logging.Formatter):
    """Custom formatter for logging with milliseconds"""
    
    def formatTime(self, record, datefmt=None):
        """Format time with milliseconds"""
        ct = self.converter(record.created)
        if datefmt:
            s = datetime.fromtimestamp(record.created).strftime(datefmt)
            return s
        else:
            # Default format with milliseconds
            return datetime.fromtimestamp(record.created).strftime('%Y-%m-%d %H:%M:%S,%f')[:-3]


def setup_logging(log_file='video_processing.log', log_level=logging.INFO):
    """
    Set up logging configuration
    
    Args:
        log_file (str): Path to the log file
        log_level (int): Logging level (e.g., logging.INFO, logging.DEBUG)
        
    Returns:
        logging.Logger: Configured logger
    """
    # Create logs directory if it doesn't exist
    log_dir = os.path.dirname(log_file)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir)
    
    # Remove all existing handlers to prevent logging to the console
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)

    # Create a FileHandler to write logs to a file
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(log_level)

    # Create and set the custom formatter with valid logging format placeholders
    formatter = CustomFormatter(fmt='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
    file_handler.setFormatter(formatter)

    # Configure the root logger
    logger = logging.getLogger()
    logger.setLevel(log_level)
    logger.addHandler(file_handler)
    
    # Create a console handler for INFO level and above
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter('%(levelname)s: %(message)s')
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    return logger


def get_logger(name):
    """
    Get a logger with the specified name
    
    Args:
        name (str): Logger name
        
    Returns:
        logging.Logger: Logger instance
    """
    return logging.getLogger(name) 